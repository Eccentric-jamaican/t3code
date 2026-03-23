import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS error_inbox_entries (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      project_id TEXT,
      thread_id TEXT,
      turn_id TEXT,
      provider TEXT,
      summary TEXT NOT NULL,
      detail TEXT,
      latest_context_json TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL,
      linked_task_id TEXT,
      resolution TEXT
    );
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_error_inbox_entries_fingerprint
    ON error_inbox_entries(fingerprint);
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_error_inbox_entries_last_seen
    ON error_inbox_entries(last_seen_at DESC, id ASC);
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_error_inbox_entries_project_resolution
    ON error_inbox_entries(project_id, resolution, last_seen_at DESC);
  `;
});
