import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      text TEXT NOT NULL,
      outgoing_text TEXT NOT NULL,
      title_seed TEXT NOT NULL,
      model_selection_json TEXT NOT NULL,
      runtime_mode TEXT NOT NULL,
      interaction_mode TEXT NOT NULL,
      attachments_json TEXT,
      summary_json TEXT,
      created_at TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL,
      last_error TEXT,
      source TEXT,
      source_activity_id TEXT,
      client_request_id TEXT,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx
      ON scheduled_messages(status, scheduled_for)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS scheduled_messages_thread_idx
      ON scheduled_messages(thread_id)
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS scheduled_messages_client_request_idx
      ON scheduled_messages(client_request_id)
      WHERE client_request_id IS NOT NULL
  `;
});
