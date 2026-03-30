/**
 * Tests for protocol helpers: generateId, now, makeTraceEvent
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateId, now, makeTraceEvent } from "../dist/index.js";

describe("generateId", () => {
  it("returns a non-empty string", () => {
    const id = generateId();
    assert.ok(typeof id === "string");
    assert.ok(id.length > 0);
  });

  it("returns unique ids on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    assert.equal(ids.size, 100, "expected 100 unique IDs");
  });

  it("contains three segments separated by dashes", () => {
    const id = generateId();
    const parts = id.split("-");
    assert.equal(parts.length, 3);
    parts.forEach((p) => assert.ok(p.length > 0));
  });
});

describe("now", () => {
  it("returns a valid ISO 8601 string", () => {
    const ts = now();
    const d = new Date(ts);
    assert.ok(!isNaN(d.getTime()), `Invalid date: ${ts}`);
    assert.ok(ts.endsWith("Z"), "Should end with Z (UTC)");
  });
});

describe("makeTraceEvent", () => {
  it("creates an agent_message event with required fields", () => {
    const evt = makeTraceEvent("agent_message", "sess-1", {
      role: "assistant",
      content: "Hello",
    });
    assert.equal(evt.type, "agent_message");
    assert.equal(evt.sessionId, "sess-1");
    assert.equal(evt.role, "assistant");
    assert.equal(evt.content, "Hello");
    assert.ok(evt.id);
    assert.ok(evt.timestamp);
  });

  it("creates a tool_call event", () => {
    const evt = makeTraceEvent("tool_call", "sess-2", {
      toolName: "search",
      toolInput: { query: "test" },
      status: "started",
    });
    assert.equal(evt.type, "tool_call");
    assert.equal(evt.toolName, "search");
    assert.deepEqual(evt.toolInput, { query: "test" });
    assert.equal(evt.status, "started");
  });

  it("creates a tool_result event", () => {
    const evt = makeTraceEvent("tool_result", "sess-3", {
      toolCallId: "tc-1",
      output: "result data",
      isError: false,
    });
    assert.equal(evt.type, "tool_result");
    assert.equal(evt.toolCallId, "tc-1");
    assert.equal(evt.isError, false);
  });

  it("creates a status_change event", () => {
    const evt = makeTraceEvent("status_change", "sess-4", {
      status: "thinking",
      detail: "Planning next step",
    });
    assert.equal(evt.type, "status_change");
    assert.equal(evt.status, "thinking");
  });

  it("creates an error event", () => {
    const evt = makeTraceEvent("error", "sess-5", {
      code: "TIMEOUT",
      message: "Request timed out",
    });
    assert.equal(evt.type, "error");
    assert.equal(evt.code, "TIMEOUT");
  });

  it("creates a stream_delta event", () => {
    const evt = makeTraceEvent("stream_delta", "sess-6", {
      delta: "partial token",
    });
    assert.equal(evt.type, "stream_delta");
    assert.equal(evt.delta, "partial token");
  });

  it("creates subagent_spawn and subagent_result events", () => {
    const spawn = makeTraceEvent("subagent_spawn", "sess-7", {
      subagentId: "sub-1",
      subagentName: "researcher",
      task: "find data",
    });
    assert.equal(spawn.type, "subagent_spawn");
    assert.equal(spawn.subagentId, "sub-1");

    const result = makeTraceEvent("subagent_result", "sess-7", {
      subagentId: "sub-1",
      output: "found it",
      isError: false,
    });
    assert.equal(result.type, "subagent_result");
  });

  it("assigns unique IDs to each event", () => {
    const e1 = makeTraceEvent("agent_message", "s", { role: "assistant", content: "a" });
    const e2 = makeTraceEvent("agent_message", "s", { role: "assistant", content: "b" });
    assert.notEqual(e1.id, e2.id);
  });
});
