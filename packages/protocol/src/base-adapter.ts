/**
 * BaseAdapter — abstract base class for all framework adapters.
 *
 * Provides shared functionality:
 *   - Lifecycle management (connect/disconnect with consistent API)
 *   - Command validation and length limits before forwarding to agent
 *   - Subagent trace helpers (emitSubagentSpawn, emitSubagentResult)
 *   - Remote input waiting (waitForInput)
 *   - Convenience trace emitters (emitToolCall, emitToolResult, etc.)
 *   - Status mapping from framework-specific strings
 */

import type {
  AgentAdapter,
  RemoteCommand,
  SessionInfo,
} from "./index.js";
import { generateId, makeTraceEvent } from "./index.js";
import { RemoteControlClient } from "./client.js";
import type { RemoteControlClientOptions } from "./client.js";

export { RemoteControlClient } from "./client.js";
export type { RemoteControlClientOptions } from "./client.js";

export type AgentStatus = "idle" | "thinking" | "executing" | "waiting_for_input" | "error";

export interface StatusMapping {
  [frameworkStatus: string]: AgentStatus;
}

/** Max length for injected message content (characters). */
const MAX_INJECT_MESSAGE_LENGTH = 100_000;

/** Allowed command types that the relay can forward. */
const ALLOWED_COMMAND_TYPES = new Set(["inject_message", "cancel", "approve_tool", "deny_tool"]);

export abstract class BaseAdapter implements AgentAdapter {
  abstract readonly name: string;
  abstract readonly framework: SessionInfo["agentFramework"];

  readonly client: RemoteControlClient;
  private pendingInput: ((content: string) => void) | null = null;
  private statusMapping: StatusMapping;

  constructor(
    relayUrl: string,
    framework: SessionInfo["agentFramework"],
    options: RemoteControlClientOptions,
    statusMapping: StatusMapping = {},
  ) {
    this.client = new RemoteControlClient(relayUrl, framework, options);
    this.statusMapping = { ...DEFAULT_STATUS_MAPPING, ...statusMapping };
    this.client.onCommand((cmd) => this.handleCommand(cmd));
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  async connect(): Promise<void> {
    await this.client.connect();
  }

  disconnect(): void {
    this.client.disconnect();
  }

  get sessionId(): string {
    return this.client.session.sessionId;
  }

  // ── AgentAdapter ───────────────────────────────────────────────────

  /**
   * Validates and routes incoming commands. Rejects malformed or oversized commands.
   * Override onInjectMessage/onCancel/onApproveTool/onDenyTool in subclasses
   * for framework-specific handling.
   */
  async handleCommand(command: RemoteCommand): Promise<void> {
    // Validate command type
    if (!command || !ALLOWED_COMMAND_TYPES.has(command.type)) {
      console.warn(`[remote-control] Rejected unknown command type: ${command?.type}`);
      return;
    }

    switch (command.type) {
      case "inject_message": {
        // Validate content exists and is within size limits
        if (typeof command.content !== "string" || command.content.length === 0) {
          console.warn("[remote-control] Rejected inject_message: empty content");
          return;
        }
        if (command.content.length > MAX_INJECT_MESSAGE_LENGTH) {
          console.warn(`[remote-control] Rejected inject_message: content too long (${command.content.length} chars)`);
          return;
        }

        if (this.pendingInput) {
          this.pendingInput(command.content);
          this.pendingInput = null;
        } else {
          await this.onInjectMessage(command.content, command.role ?? "user");
        }
        break;
      }
      case "cancel":
        await this.onCancel(command.reason);
        break;
      case "approve_tool":
        if (typeof command.toolCallId !== "string" || command.toolCallId.length === 0) {
          return;
        }
        await this.onApproveTool(command.toolCallId);
        break;
      case "deny_tool":
        if (typeof command.toolCallId !== "string" || command.toolCallId.length === 0) {
          return;
        }
        await this.onDenyTool(command.toolCallId, command.reason);
        break;
    }
  }

  /**
   * Called when a message is injected and no waitForInput is pending.
   * Override in subclasses to route messages to the agent framework.
   */
  protected async onInjectMessage(_content: string, _role: string): Promise<void> {
    // Default: no-op. Subclasses override to send to their framework.
  }

  /** Override to handle cancel commands in framework-specific way. */
  protected async onCancel(reason?: string): Promise<void> {
    this.emitStatus("idle", `Cancelled: ${reason ?? "user request"}`);
  }

  /** Override to handle tool approval commands. */
  protected async onApproveTool(_toolCallId: string): Promise<void> {}

  /** Override to handle tool denial commands. */
  protected async onDenyTool(_toolCallId: string, _reason?: string): Promise<void> {}

  // ── Trace Emitters ─────────────────────────────────────────────────

  emitAgentMessage(content: string, role: "assistant" | "system" = "assistant", model?: string): void {
    this.client.emitTrace(
      makeTraceEvent("agent_message", this.sessionId, { role, content, model }),
    );
  }

  emitToolCall(toolName: string, toolInput: Record<string, unknown>, status: "started" | "completed" | "failed"): void {
    this.client.emitTrace(
      makeTraceEvent("tool_call", this.sessionId, { toolName, toolInput, status }),
    );
  }

  emitToolResult(toolCallId: string, output: string, isError = false): void {
    this.client.emitTrace(
      makeTraceEvent("tool_result", this.sessionId, { toolCallId, output, isError }),
    );
  }

  emitSubagentSpawn(subagentId: string, subagentName: string, task: string): void {
    this.client.emitTrace(
      makeTraceEvent("subagent_spawn", this.sessionId, { subagentId, subagentName, task }),
    );
  }

  emitSubagentResult(subagentId: string, output: string, isError = false): void {
    this.client.emitTrace(
      makeTraceEvent("subagent_result", this.sessionId, { subagentId, output, isError }),
    );
  }

  emitStatus(status: AgentStatus, detail?: string): void {
    this.client.emitTrace(
      makeTraceEvent("status_change", this.sessionId, { status, detail }),
    );
  }

  emitError(code: string, message: string, stack?: string): void {
    this.client.emitTrace(
      makeTraceEvent("error", this.sessionId, { code, message, stack }),
    );
  }

  emitStreamDelta(delta: string): void {
    this.client.emitTrace(
      makeTraceEvent("stream_delta", this.sessionId, { delta }),
    );
  }

  // ── Status Mapping ─────────────────────────────────────────────────

  /**
   * Maps a framework-specific status string to a normalized AgentStatus.
   * Uses the status mapping provided at construction time, falling back to "idle".
   */
  mapStatus(frameworkStatus: string): AgentStatus {
    return this.statusMapping[frameworkStatus] ?? "idle";
  }

  /**
   * Emits a status_change trace, mapping from a framework-specific status string.
   */
  emitMappedStatus(frameworkStatus: string, detail?: string): void {
    this.emitStatus(this.mapStatus(frameworkStatus), detail);
  }

  // ── Wait for Input ─────────────────────────────────────────────────

  /**
   * Wait for remote user input. Sets agent status to waiting_for_input
   * and resolves when an inject_message command arrives.
   */
  waitForInput(prompt?: string): Promise<string> {
    this.emitStatus("waiting_for_input", prompt);
    return new Promise((resolve) => {
      this.pendingInput = resolve;
    });
  }

  // ── Tool Call Wrapper ──────────────────────────────────────────────

  /**
   * Wraps a tool execution, emitting start/result/completion traces automatically.
   * Use this in middleware hooks to avoid duplicating the trace-emit pattern.
   */
  async wrapToolExecution<T>(
    toolName: string,
    toolInput: Record<string, unknown>,
    execute: () => Promise<T & { output: string; error?: string }>,
  ): Promise<T & { output: string; error?: string }> {
    const callId = generateId();

    this.emitToolCall(toolName, toolInput, "started");
    this.emitStatus("executing", `Running ${toolName}`);

    try {
      const result = await execute();
      this.emitToolResult(callId, result.output, !!result.error);
      this.emitToolCall(toolName, toolInput, result.error ? "failed" : "completed");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitToolResult(callId, message, true);
      this.emitToolCall(toolName, toolInput, "failed");
      throw err;
    }
  }

  /**
   * Wraps a model call, emitting thinking status and agent_message traces.
   */
  async wrapModelCall<TReq, TRes extends { content: string }>(
    request: TReq & { model?: string },
    handler: (req: TReq) => Promise<TRes>,
  ): Promise<TRes> {
    this.emitStatus("thinking");
    const response = await handler(request);
    this.emitAgentMessage(response.content, "assistant", request.model);
    return response;
  }
}

// ── Default Status Mapping ──────────────────────────────────────────

const DEFAULT_STATUS_MAPPING: StatusMapping = {
  idle: "idle",
  ready: "idle",
  thinking: "thinking",
  reasoning: "thinking",
  planning: "thinking",
  executing: "executing",
  running: "executing",
  tool_calling: "executing",
  rendering: "executing",
  waiting: "waiting_for_input",
  waiting_for_input: "waiting_for_input",
  approval_required: "waiting_for_input",
  error: "error",
};
