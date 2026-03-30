/**
 * @axolotlai/arc-protocol
 *
 * Defines the wire protocol for agent remote control.
 * All messages are JSON-serialized and sent over WebSocket.
 */

// ─── Session ────────────────────────────────────────────────────────

export interface SessionInfo {
  sessionId: string;
  agentFramework: "hermes" | "deepagent" | "openclaw";
  agentName?: string;
  startedAt: string; // ISO 8601
  metadata?: Record<string, unknown>;
  /** E2E encryption mode. Absent or "none" means plaintext. */
  e2e?: E2EMode;
}

// ─── Trace Events (Agent → Relay → Client) ─────────────────────────

export type TraceEvent =
  | AgentMessageEvent
  | ToolCallEvent
  | ToolResultEvent
  | SubagentSpawnEvent
  | SubagentResultEvent
  | StatusChangeEvent
  | ErrorEvent
  | StreamDeltaEvent;

interface BaseEvent {
  id: string;
  sessionId: string;
  timestamp: string; // ISO 8601
  parentId?: string; // for nesting (subagent traces, tool-in-tool)
}

export interface AgentMessageEvent extends BaseEvent {
  type: "agent_message";
  role: "assistant" | "system";
  content: string;
  model?: string;
}

export interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  toolName: string;
  toolInput: Record<string, unknown>;
  status: "started" | "completed" | "failed";
}

export interface ToolResultEvent extends BaseEvent {
  type: "tool_result";
  toolCallId: string;
  output: string;
  isError: boolean;
}

export interface SubagentSpawnEvent extends BaseEvent {
  type: "subagent_spawn";
  subagentId: string;
  subagentName: string;
  task: string;
}

export interface SubagentResultEvent extends BaseEvent {
  type: "subagent_result";
  subagentId: string;
  output: string;
  isError: boolean;
}

export interface StatusChangeEvent extends BaseEvent {
  type: "status_change";
  status: "idle" | "thinking" | "executing" | "waiting_for_input" | "error";
  detail?: string;
}

export interface ErrorEvent extends BaseEvent {
  type: "error";
  code: string;
  message: string;
  stack?: string;
}

export interface StreamDeltaEvent extends BaseEvent {
  type: "stream_delta";
  delta: string; // partial token for streaming responses
}

// ─── Commands (Client → Relay → Agent) ──────────────────────────────

export type RemoteCommand =
  | InjectMessageCommand
  | CancelCommand
  | ApproveToolCommand
  | DenyToolCommand;

interface BaseCommand {
  id: string;
  sessionId: string;
  timestamp: string;
}

export interface InjectMessageCommand extends BaseCommand {
  type: "inject_message";
  content: string;
  role?: "user" | "system"; // defaults to "user"
}

export interface CancelCommand extends BaseCommand {
  type: "cancel";
  reason?: string;
}

export interface ApproveToolCommand extends BaseCommand {
  type: "approve_tool";
  toolCallId: string;
}

export interface DenyToolCommand extends BaseCommand {
  type: "deny_tool";
  toolCallId: string;
  reason?: string;
}

// ─── E2E Encryption ────────────────────────────────────────────────

/** Encrypted payload — replaces the `event` or `command` field when E2E is active. */
export interface EncryptedField {
  /** Base64-encoded AES-256-GCM ciphertext (includes auth tag). */
  ciphertext: string;
  /** Base64-encoded 12-byte nonce. */
  nonce: string;
}

/** E2E encryption mode for a session. */
export type E2EMode = "none" | "session_secret" | "passkey" | "passphrase";

// ─── Envelope (wraps all messages on the wire) ──────────────────────

export type ClientEnvelope =
  | { kind: "register"; session: SessionInfo }
  | { kind: "trace"; event: TraceEvent }
  | { kind: "trace"; event: EncryptedField; encrypted: true }
  | { kind: "command"; command: RemoteCommand }
  | { kind: "command"; command: EncryptedField; encrypted: true }
  | { kind: "subscribe"; sessionId: string; sessionSecret: string }
  | { kind: "ping" }
  | { kind: "pong" };

// ─── Adapter Interface ──────────────────────────────────────────────

/**
 * Every framework adapter must implement this interface.
 * The RemoteControlClient calls these to wire up the connection.
 */
export interface AgentAdapter {
  /** Human-readable name for this adapter */
  readonly name: string;
  /** Which framework this adapts */
  readonly framework: SessionInfo["agentFramework"];
  /**
   * Called when a remote command arrives.
   * The adapter must route it to the underlying agent.
   */
  handleCommand(command: RemoteCommand): Promise<void>;
}

// ─── Client (used by adapters to send events) ───────────────────────

export interface RemoteControlTransport {
  send(envelope: ClientEnvelope): void;
  onMessage(handler: (envelope: ClientEnvelope) => void): void;
  connect(url: string): Promise<void>;
  disconnect(): void;
  readonly connected: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

let counter = 0;

export function generateId(): string {
  return `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function makeTraceEvent<T extends TraceEvent["type"]>(
  type: T,
  sessionId: string,
  fields: Omit<Extract<TraceEvent, { type: T }>, "id" | "sessionId" | "timestamp" | "type">,
): Extract<TraceEvent, { type: T }> {
  return {
    id: generateId(),
    sessionId,
    timestamp: now(),
    type,
    ...fields,
  } as Extract<TraceEvent, { type: T }>;
}
