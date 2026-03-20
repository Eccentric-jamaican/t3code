import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN origin TEXT NOT NULL DEFAULT 'user'
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN task_id TEXT
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_tasks (
      task_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      brief TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL,
      state TEXT NOT NULL,
      priority INTEGER,
      thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_project_rules (
      project_id TEXT PRIMARY KEY,
      prompt_template TEXT NOT NULL,
      default_model TEXT,
      default_runtime_mode TEXT NOT NULL,
      on_success_move_to TEXT NOT NULL,
      on_failure_move_to TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_tasks_project_id
    ON projection_tasks(project_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_tasks_thread_id
    ON projection_tasks(thread_id)
  `;
});
