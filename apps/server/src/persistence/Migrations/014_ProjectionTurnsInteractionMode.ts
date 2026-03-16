import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_turns
    ADD COLUMN interaction_mode TEXT NOT NULL DEFAULT 'default'
  `;

  yield* sql`
    UPDATE projection_turns
    SET interaction_mode = COALESCE(
      (
        SELECT json_extract(orchestration_events.payload_json, '$.interactionMode')
        FROM orchestration_events
        WHERE orchestration_events.stream_id = projection_turns.thread_id
          AND orchestration_events.event_type = 'thread.turn-start-requested'
          AND json_extract(orchestration_events.payload_json, '$.messageId') = projection_turns.pending_message_id
        ORDER BY orchestration_events.sequence DESC
        LIMIT 1
      ),
      'default'
    )
  `;
});
