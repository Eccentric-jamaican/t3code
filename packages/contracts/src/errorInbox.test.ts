import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { ErrorInboxEntry, ServerErrorInboxUpdatedPayload } from "./errorInbox";
import { WebSocketRequest, WS_METHODS } from "./ws";

const decodeWebSocketRequest = Schema.decodeUnknownSync(WebSocketRequest);
const decodeErrorInboxEntry = Schema.decodeUnknownSync(ErrorInboxEntry);
const decodeErrorInboxUpdatedPayload = Schema.decodeUnknownSync(ServerErrorInboxUpdatedPayload);

describe("error inbox contracts", () => {
  it("decodes server.reportClientDiagnostic websocket requests", () => {
    const parsed = decodeWebSocketRequest({
      id: "req-error-inbox",
      body: {
        _tag: WS_METHODS.serverReportClientDiagnostic,
        source: "browser-runtime",
        category: "browser",
        severity: "error",
        summary: "Unhandled runtime error",
        detail: "Cannot read properties of undefined",
        projectId: "project-1",
        threadId: "thread-1",
        context: {
          route: "/thread-1",
        },
      },
    });

    assert.strictEqual(parsed.body._tag, WS_METHODS.serverReportClientDiagnostic);
    if (parsed.body._tag === WS_METHODS.serverReportClientDiagnostic) {
      assert.strictEqual(parsed.body.summary, "Unhandled runtime error");
      assert.strictEqual(parsed.body.projectId, "project-1");
      assert.strictEqual(parsed.body.threadId, "thread-1");
    }
  });

  it("decodes server.errorInboxUpdated payloads", () => {
    const entry = decodeErrorInboxEntry({
      id: "err-1",
      fingerprint: "fingerprint-1",
      source: "provider-runtime",
      category: "provider",
      severity: "error",
      projectId: "project-1",
      threadId: "thread-1",
      turnId: "turn-1",
      provider: "codex",
      summary: "Provider runtime error",
      detail: "spawn failed",
      latestContextJson: {
        method: "process/error",
      },
      firstSeenAt: "2026-03-22T19:00:00.000Z",
      lastSeenAt: "2026-03-22T19:05:00.000Z",
      occurrenceCount: 2,
      linkedTaskId: null,
      resolution: null,
    });

    const payload = decodeErrorInboxUpdatedPayload({
      reason: "upsert",
      entry,
    });

    assert.strictEqual(payload.reason, "upsert");
    assert.strictEqual(payload.entry.summary, "Provider runtime error");
    assert.strictEqual(payload.entry.occurrenceCount, 2);
  });
});
