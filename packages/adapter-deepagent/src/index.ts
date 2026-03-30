/**
 * @axolotlai/arc-adapter-deepagent
 *
 * DeepAgent (LangChain) middleware that intercepts model calls,
 * tool calls, and subagent spawns to emit remote control trace events.
 *
 * Usage:
 *   import { createDeepAgent } from "deepagents";
 *   import { RemoteControlMiddleware } from "@axolotlai/arc-adapter-deepagent";
 *
 *   const rc = new RemoteControlMiddleware("ws://localhost:8600", {
 *     agentName: "my-deep-agent",
 *   });
 *
 *   await rc.connect();
 *   const agent = createDeepAgent({ middleware: [rc] });
 *   await agent.invoke({ messages: [{ role: "user", content: "Hello" }] });
 *   rc.disconnect();
 */

import { BaseAdapter } from "@axolotlai/arc-protocol/base-adapter";
import type { RemoteControlClientOptions } from "@axolotlai/arc-protocol/base-adapter";

export { BaseAdapter, RemoteControlClient } from "@axolotlai/arc-protocol/base-adapter";

/**
 * Implements the DeepAgent AgentMiddleware protocol.
 *
 * DeepAgent middleware has two key hooks:
 *   - wrap_model_call(request, handler) — intercepts LLM invocations
 *   - wrap_tool_call(request, handler) — intercepts tool executions
 *
 * This middleware wraps both to emit trace events to the relay server.
 */
export class RemoteControlMiddleware extends BaseAdapter {
  readonly name = "remote-control";
  readonly framework = "deepagent" as const;

  constructor(relayUrl: string, options: RemoteControlClientOptions) {
    super(relayUrl, "deepagent", options);
  }

  // ── DeepAgent Middleware Hooks ──

  /**
   * wrap_model_call — intercepts LLM invocations.
   * Emits agent_message traces for model responses.
   */
  async wrap_model_call(
    request: { messages: Array<{ role: string; content: string }>; model?: string },
    handler: (req: typeof request) => Promise<{ content: string; role: string }>,
  ): Promise<{ content: string; role: string }> {
    return this.wrapModelCall(request, handler);
  }

  /**
   * wrap_tool_call — intercepts tool executions.
   * Emits tool_call and tool_result traces.
   */
  async wrap_tool_call(
    request: { name: string; args: Record<string, unknown>; id?: string },
    handler: (req: typeof request) => Promise<{ output: string; error?: string }>,
  ): Promise<{ output: string; error?: string }> {
    return this.wrapToolExecution(request.name, request.args, () => handler(request));
  }
}
