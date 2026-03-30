/**
 * @axolotlai/arc-adapter-openclaw
 *
 * OpenClaw plugin adapter for remote control.
 *
 * OpenClaw's architecture uses:
 *   1. A Gateway that handles multi-channel messaging
 *   2. A Canvas system with A2UI (Agent-to-UI) protocol for declarative rendering
 *   3. WebSocket communication between Gateway and Canvas
 *
 * This adapter connects to the OpenClaw Gateway's WebSocket API and translates
 * its events into the universal remote control protocol.
 *
 * Usage:
 *   import { OpenClawRemoteControl } from "@axolotlai/arc-adapter-openclaw";
 *
 *   const rc = new OpenClawRemoteControl({
 *     relayUrl: "ws://localhost:8600",
 *     gatewayUrl: "ws://localhost:8080",
 *     agentName: "my-openclaw-agent",
 *   });
 *
 *   await rc.start();
 */

import { WebSocket } from "ws";
import { BaseAdapter } from "@axolotlai/arc-protocol/base-adapter";
import type { StatusMapping } from "@axolotlai/arc-protocol/base-adapter";
import { generateId } from "@axolotlai/arc-protocol";

export { BaseAdapter, RemoteControlClient } from "@axolotlai/arc-protocol/base-adapter";

export interface OpenClawRemoteControlOptions {
  relayUrl: string;
  gatewayUrl: string;
  /** Agent token for authenticating with the relay server. REQUIRED. */
  agentToken: string;
  agentName?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/** OpenClaw-specific status values beyond the defaults in BaseAdapter. */
const OPENCLAW_STATUS_MAPPING: StatusMapping = {
  rendering: "executing",
  approval_required: "waiting_for_input",
};

/**
 * Connects to OpenClaw Gateway's WebSocket and forwards events to
 * the remote control relay server.
 *
 * OpenClaw Gateway message types:
 *   - agent_response, tool_execution, canvas_update, status_update, error, stream
 */
export class OpenClawRemoteControl extends BaseAdapter {
  readonly name = "openclaw-remote-control";
  readonly framework = "openclaw" as const;

  private gatewayUrl: string;
  private gatewayWs: WebSocket | null = null;

  constructor(options: OpenClawRemoteControlOptions) {
    super(options.relayUrl, "openclaw", {
      agentToken: options.agentToken,
      agentName: options.agentName,
      sessionId: options.sessionId,
      metadata: options.metadata,
    }, OPENCLAW_STATUS_MAPPING);

    this.gatewayUrl = options.gatewayUrl;
  }

  async start(): Promise<void> {
    await this.connect();
    this.connectToGateway();
  }

  stop(): void {
    this.gatewayWs?.close();
    this.disconnect();
  }

  // ── Command handlers (override BaseAdapter hooks) ──

  protected override async onInjectMessage(content: string, role: string): Promise<void> {
    this.sendToGateway({
      type: "user_message",
      channel: "remote-control",
      content,
      role,
    });
  }

  protected override async onCancel(reason?: string): Promise<void> {
    this.sendToGateway({ type: "cancel", reason });
    this.emitStatus("idle", `Cancelled: ${reason ?? "user request"}`);
  }

  protected override async onApproveTool(toolCallId: string): Promise<void> {
    this.sendToGateway({
      type: "tool_approval",
      tool_call_id: toolCallId,
      approved: true,
    });
  }

  protected override async onDenyTool(toolCallId: string, reason?: string): Promise<void> {
    this.sendToGateway({
      type: "tool_approval",
      tool_call_id: toolCallId,
      approved: false,
      reason,
    });
  }

  // ── Gateway Connection ──

  private connectToGateway(): void {
    this.gatewayWs = new WebSocket(this.gatewayUrl);

    this.gatewayWs.on("open", () => {
      this.sendToGateway({
        type: "register_channel",
        channel: "remote-control",
        capabilities: ["text", "tool_approval"],
      });
    });

    this.gatewayWs.on("message", (raw) => {
      try {
        this.handleGatewayEvent(JSON.parse(raw.toString()));
      } catch {
        // skip malformed messages
      }
    });

    this.gatewayWs.on("close", () => {
      setTimeout(() => this.connectToGateway(), 5000);
    });

    this.gatewayWs.on("error", (err) => {
      console.error("[openclaw-adapter] Gateway error:", err);
    });
  }

  private sendToGateway(message: Record<string, unknown>): void {
    if (this.gatewayWs?.readyState === WebSocket.OPEN) {
      this.gatewayWs.send(JSON.stringify(message));
    }
  }

  /**
   * Maps OpenClaw Gateway events to remote control trace events
   * using BaseAdapter's shared emitters.
   */
  private handleGatewayEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    switch (type) {
      case "agent_response":
        this.emitAgentMessage(
          event.content as string,
          (event.role as "assistant" | "system") ?? "assistant",
          event.model as string | undefined,
        );
        break;

      case "tool_execution": {
        const status = event.status as string;
        if (status === "started") {
          this.emitToolCall(
            event.tool_name as string,
            (event.arguments as Record<string, unknown>) ?? {},
            "started",
          );
        } else {
          this.emitToolResult(
            (event.id as string) ?? generateId(),
            (event.output as string) ?? "",
            status === "failed",
          );
          this.emitToolCall(
            event.tool_name as string,
            (event.arguments as Record<string, unknown>) ?? {},
            status === "failed" ? "failed" : "completed",
          );
        }
        break;
      }

      case "canvas_update":
        this.emitAgentMessage(
          `[Canvas: ${event.surface_type}] Surface ${event.surface_id} updated`,
          "system",
        );
        break;

      case "status_update":
        this.emitMappedStatus(
          event.status as string,
          event.detail as string | undefined,
        );
        break;

      case "error":
        this.emitError(
          (event.code as string) ?? "OPENCLAW_ERROR",
          event.message as string,
        );
        break;

      case "stream":
        this.emitStreamDelta(event.content as string);
        break;
    }
  }
}
