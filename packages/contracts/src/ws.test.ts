import { assert, it } from "@effect/vitest";
import { Schema } from "effect";

import { ORCHESTRATION_WS_METHODS } from "./orchestration";
import { WebSocketRequest } from "./ws";

const decodeWebSocketRequest = Schema.decodeUnknownSync(WebSocketRequest);

it("accepts getTurnDiff requests when fromTurnCount <= toTurnCount", () => {
  const parsed = decodeWebSocketRequest({
    id: "req-1",
    body: {
      _tag: ORCHESTRATION_WS_METHODS.getTurnDiff,
      threadId: "thread-1",
      fromTurnCount: 1,
      toTurnCount: 2,
    },
  });
  assert.strictEqual(parsed.body._tag, ORCHESTRATION_WS_METHODS.getTurnDiff);
});

it("rejects getTurnDiff requests when fromTurnCount > toTurnCount", () => {
  let didThrow = false;
  try {
    decodeWebSocketRequest({
      id: "req-1",
      body: {
        _tag: ORCHESTRATION_WS_METHODS.getTurnDiff,
        threadId: "thread-1",
        fromTurnCount: 3,
        toTurnCount: 2,
      },
    });
  } catch {
    didThrow = true;
  }
  assert.strictEqual(didThrow, true);
});

it("trims websocket request id and nested orchestration ids", () => {
  const parsed = decodeWebSocketRequest({
    id: " req-1 ",
    body: {
      _tag: ORCHESTRATION_WS_METHODS.getTurnDiff,
      threadId: " thread-1 ",
      fromTurnCount: 0,
      toTurnCount: 0,
    },
  });
  assert.strictEqual(parsed.id, "req-1");
  assert.strictEqual(parsed.body._tag, ORCHESTRATION_WS_METHODS.getTurnDiff);
  if (parsed.body._tag === ORCHESTRATION_WS_METHODS.getTurnDiff) {
    assert.strictEqual(parsed.body.threadId, "thread-1");
  }
});

it("decodes websocket requests synchronously", () => {
  const parsed = decodeWebSocketRequest({
    id: "req-sync",
    body: {
      _tag: ORCHESTRATION_WS_METHODS.getTurnDiff,
      threadId: "thread-sync",
      fromTurnCount: 0,
      toTurnCount: 0,
    },
  });
  assert.strictEqual(parsed.id, "req-sync");
});
