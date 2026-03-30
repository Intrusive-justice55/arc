/**
 * @axolotlai/arc-adapter-hermes
 *
 * Hermes Agent (Nous Research) plugin adapter for remote control.
 *
 * NOTE: This TypeScript adapter is largely superseded by the native Python
 * plugin at hermes-plugin/arc-remote-control/. The native plugin integrates
 * directly with Hermes's lifecycle hooks and doesn't require a separate process.
 *
 * This adapter connects to Hermes via its HTTP/SSE API and relays events to
 * the remote control relay server. It's kept for cases where the native plugin
 * can't be used (e.g., Hermes running as a server, not CLI).
 *
 * Usage:
 *   import { HermesRemoteControl } from "@axolotlai/arc-adapter-hermes";
 *
 *   const rc = new HermesRemoteControl({
 *     relayUrl: "ws://localhost:8600",
 *     hermesApiUrl: "http://localhost:3000",
 *     agentName: "my-hermes-agent",
 *   });
 *
 *   await rc.start();
 */

import { BaseAdapter } from "@axolotlai/arc-protocol/base-adapter";
import type { StatusMapping } from "@axolotlai/arc-protocol/base-adapter";
import { generateId } from "@axolotlai/arc-protocol";

export { BaseAdapter, RemoteControlClient } from "@axolotlai/arc-protocol/base-adapter";

export interface HermesRemoteControlOptions {
  relayUrl: string;
  hermesApiUrl: string;
  /** Agent token for authenticating with the relay server. REQUIRED. */
  agentToken: string;
  agentName?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/** Hermes-specific status values beyond the defaults in BaseAdapter. */
const HERMES_STATUS_MAPPING: StatusMapping = {
  tool_calling: "executing",
  reasoning: "thinking",
};

/**
 * Connects to Hermes Agent's HTTP/SSE API and forwards events to
 * the remote control relay server.
 *
 * Hermes Agent exposes:
 *   - POST /api/chat — send messages
 *   - GET  /api/stream — SSE stream of agent events
 *   - POST /api/cancel — cancel current operation
 *
 * Hermes SSE event types:
 *   - message, tool_call, tool_result, thinking, status, error
 */
export class HermesRemoteControl extends BaseAdapter {
  readonly name = "hermes-remote-control";
  readonly framework = "hermes" as const;

  private hermesApiUrl: string;
  private abortController: AbortController | null = null;

  constructor(options: HermesRemoteControlOptions) {
    super(options.relayUrl, "hermes", {
      agentToken: options.agentToken,
      agentName: options.agentName,
      sessionId: options.sessionId,
      metadata: options.metadata,
    }, HERMES_STATUS_MAPPING);

    this.hermesApiUrl = options.hermesApiUrl.replace(/\/$/, "");
  }

  async start(): Promise<void> {
    await this.connect();
    this.connectToHermesStream();
  }

  stop(): void {
    this.abortController?.abort();
    this.disconnect();
  }

  // ── Command handlers (override BaseAdapter hooks) ──

  protected override async onInjectMessage(content: string): Promise<void> {
    await fetch(`${this.hermesApiUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content, channel: "remote-control" }),
    });
  }

  protected override async onCancel(reason?: string): Promise<void> {
    await fetch(`${this.hermesApiUrl}/api/cancel`, { method: "POST" });
    this.emitStatus("idle", `Cancelled: ${reason ?? "user request"}`);
  }

  // ── SSE Stream from Hermes Agent ──

  private async connectToHermesStream(): Promise<void> {
    this.abortController = new AbortController();

    try {
      const response = await fetch(`${this.hermesApiUrl}/api/stream`, {
        signal: this.abortController.signal,
        headers: { Accept: "text/event-stream" },
      });

      if (!response.ok || !response.body) {
        console.error(`[hermes-adapter] Failed to connect to Hermes SSE: ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              this.handleHermesEvent(JSON.parse(line.slice(6)));
            } catch {
              // skip malformed SSE data
            }
          }
        }
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        console.error("[hermes-adapter] SSE stream error:", err);
        // RemoteControlClient handles relay reconnection; this handles Hermes reconnection
        setTimeout(() => this.connectToHermesStream(), 5000);
      }
    }
  }

  /**
   * Maps Hermes Agent SSE events to remote control trace events
   * using BaseAdapter's shared emitters.
   */
  private handleHermesEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    switch (type) {
      case "message":
        this.emitAgentMessage(
          event.content as string,
          (event.role as "assistant" | "system") ?? "assistant",
          event.model as string | undefined,
        );
        break;

      case "tool_call":
        this.emitToolCall(
          event.name as string,
          (event.arguments as Record<string, unknown>) ?? {},
          "started",
        );
        break;

      case "tool_result":
        this.emitToolResult(
          (event.id as string) ?? generateId(),
          event.output as string,
          !!(event.error),
        );
        break;

      case "thinking":
        this.emitStreamDelta(event.content as string);
        break;

      case "status":
        this.emitMappedStatus(
          event.state as string,
          event.detail as string | undefined,
        );
        break;

      case "error":
        this.emitError(
          (event.code as string) ?? "HERMES_ERROR",
          event.message as string,
        );
        break;
    }
  }
}
