import { ManagedRuntime, Effect, Layer } from "effect";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { describe, expect, it } from "vitest";

import Migration0015 from "./015_ProjectionThreadsPinned.ts";

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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-migration-015-"));
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

describe("015_ProjectionThreadsPinned", () => {
  it("adds is_pinned and backfills existing rows to false", async () => {
    await withTempSqlite(async (runtime) => {
      await runtime.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;

          yield* sql`
            CREATE TABLE projection_threads (
              thread_id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              title TEXT NOT NULL,
              model TEXT NOT NULL,
              runtime_mode TEXT NOT NULL,
              interaction_mode TEXT NOT NULL DEFAULT 'default',
              branch TEXT,
              worktree_path TEXT,
              latest_turn_id TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              deleted_at TEXT
            )
          `;

          yield* sql`
            INSERT INTO projection_threads (
              thread_id,
              project_id,
              title,
              model,
              runtime_mode,
              interaction_mode,
              branch,
              worktree_path,
              latest_turn_id,
              created_at,
              updated_at,
              deleted_at
            )
            VALUES (
              'thread-1',
              'project-1',
              'Thread 1',
              'gpt-5-codex',
              'full-access',
              'default',
              NULL,
              NULL,
              NULL,
              '2026-03-01T00:00:00.000Z',
              '2026-03-01T00:00:00.000Z',
              NULL
            )
          `;

          yield* Migration0015;

          const rows = yield* sql<{
            readonly threadId: string;
            readonly isPinned: number;
          }>`
            SELECT
              thread_id AS "threadId",
              is_pinned AS "isPinned"
            FROM projection_threads
          `;

          expect(rows).toEqual([{ threadId: "thread-1", isPinned: 0 }]);
        }),
      );
    });
  });
});
