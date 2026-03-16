import { ManagedRuntime, Effect, Layer } from "effect";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { describe, expect, it } from "vitest";

import Migration0014 from "./014_ProjectionTurnsInteractionMode.ts";

type SqliteClientModule = {
  layer: (config: { filename: string }) => Layer.Layer<SqlClient.SqlClient>;
};

async function loadSqliteLayer(dbPath: string): Promise<Layer.Layer<SqlClient.SqlClient>> {
  if (process.versions.bun !== undefined) {
    const clientModule = (await import("@effect/sql-sqlite-bun/SqliteClient")) as SqliteClientModule;
    return clientModule.layer({ filename: dbPath });
  }
  const clientModule = (await import("../NodeSqliteClient.ts")) as SqliteClientModule;
  return clientModule.layer({ filename: dbPath });
}

async function withTempSqlite<A>(
  callback: (runtime: ManagedRuntime.ManagedRuntime<SqlClient.SqlClient, never>) => Promise<A>,
): Promise<A> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-migration-014-"));
  const dbPath = path.join(tempDir, "state.sqlite");
  const sqliteLayer = await loadSqliteLayer(dbPath);
  const runtime = ManagedRuntime.make(sqliteLayer);

  try {
    return await callback(runtime);
  } finally {
    await runtime.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("014_ProjectionTurnsInteractionMode", () => {
  it("backfills projection turn interaction mode from turn-start events and defaults unmatched rows", async () => {
    await withTempSqlite(async (runtime) => {
      await runtime.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;

          yield* sql`
            CREATE TABLE projection_turns (
              row_id INTEGER PRIMARY KEY AUTOINCREMENT,
              thread_id TEXT NOT NULL,
              turn_id TEXT,
              pending_message_id TEXT,
              assistant_message_id TEXT,
              state TEXT NOT NULL,
              requested_at TEXT NOT NULL,
              started_at TEXT,
              completed_at TEXT,
              checkpoint_turn_count INTEGER,
              checkpoint_ref TEXT,
              checkpoint_status TEXT,
              checkpoint_files_json TEXT NOT NULL
            )
          `;

          yield* sql`
            CREATE TABLE orchestration_events (
              sequence INTEGER PRIMARY KEY,
              stream_id TEXT NOT NULL,
              event_type TEXT NOT NULL,
              payload_json TEXT NOT NULL
            )
          `;

          yield* sql`
            INSERT INTO projection_turns (
              thread_id,
              turn_id,
              pending_message_id,
              assistant_message_id,
              state,
              requested_at,
              started_at,
              completed_at,
              checkpoint_turn_count,
              checkpoint_ref,
              checkpoint_status,
              checkpoint_files_json
            )
            VALUES
              (
                'thread-1',
                'turn-1',
                'message-plan',
                NULL,
                'completed',
                '2026-03-01T00:00:00.000Z',
                '2026-03-01T00:00:01.000Z',
                '2026-03-01T00:00:02.000Z',
                NULL,
                NULL,
                NULL,
                '[]'
              ),
              (
                'thread-1',
                'turn-2',
                'message-missing',
                NULL,
                'completed',
                '2026-03-01T00:01:00.000Z',
                '2026-03-01T00:01:01.000Z',
                '2026-03-01T00:01:02.000Z',
                NULL,
                NULL,
                NULL,
                '[]'
              )
          `;

          yield* sql`
            INSERT INTO orchestration_events (
              sequence,
              stream_id,
              event_type,
              payload_json
            )
            VALUES (
              1,
              'thread-1',
              'thread.turn-start-requested',
              '{"messageId":"message-plan","interactionMode":"plan"}'
            )
          `;

          yield* Migration0014;

          const rows = yield* sql<{
            readonly turnId: string | null;
            readonly interactionMode: string;
          }>`
            SELECT
              turn_id AS "turnId",
              interaction_mode AS "interactionMode"
            FROM projection_turns
            ORDER BY turn_id ASC
          `;

          expect(rows).toEqual([
            { turnId: "turn-1", interactionMode: "plan" },
            { turnId: "turn-2", interactionMode: "default" },
          ]);
        }),
      );
    });
  });
});
