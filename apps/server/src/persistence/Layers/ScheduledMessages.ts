import {
  ModelSelection,
  ScheduledMessage,
  ScheduledMessageId,
  ScheduledMessageSource,
  ScheduledMessageStatus,
  ScheduledMessageSummary,
  ThreadId,
  UploadChatAttachment,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  ScheduledMessageRepository,
  ScheduledMessageRepositoryCreateInput,
} from "../Services/ScheduledMessages.ts";

const ScheduledMessageDbRow = ScheduledMessage.mapFields(
  Struct.assign({
    modelSelection: Schema.fromJsonString(ModelSelection),
    attachments: Schema.NullOr(Schema.fromJsonString(Schema.Array(UploadChatAttachment))),
    summary: Schema.NullOr(Schema.fromJsonString(ScheduledMessageSummary)),
    lastError: Schema.NullOr(Schema.String),
    source: Schema.NullOr(ScheduledMessageSource),
    sourceActivityId: Schema.NullOr(Schema.String),
  }),
);

const OptionalThreadInput = Schema.Struct({
  threadId: Schema.optional(ThreadId),
});
const IdInput = Schema.Struct({ id: ScheduledMessageId });
const DueInput = Schema.Struct({ now: Schema.String, limit: Schema.Number });
const StatusInput = Schema.Struct({
  id: ScheduledMessageId,
  status: ScheduledMessageStatus,
  lastError: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
});

function toDomain(row: Schema.Schema.Type<typeof ScheduledMessageDbRow>): ScheduledMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    text: row.text,
    outgoingText: row.outgoingText,
    titleSeed: row.titleSeed,
    modelSelection: row.modelSelection,
    runtimeMode: row.runtimeMode,
    interactionMode: row.interactionMode,
    ...(row.attachments !== null ? { attachments: row.attachments } : {}),
    ...(row.summary !== null ? { summary: row.summary } : {}),
    createdAt: row.createdAt,
    scheduledFor: row.scheduledFor,
    status: row.status,
    ...(row.lastError !== null ? { lastError: row.lastError } : {}),
    ...(row.source !== null ? { source: row.source } : {}),
    ...(row.sourceActivityId !== null ? { sourceActivityId: row.sourceActivityId } : {}),
  };
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const rowColumns = sql`
    SELECT
      id,
      thread_id AS "threadId",
      text,
      outgoing_text AS "outgoingText",
      title_seed AS "titleSeed",
      model_selection_json AS "modelSelection",
      runtime_mode AS "runtimeMode",
      interaction_mode AS "interactionMode",
      attachments_json AS "attachments",
      summary_json AS "summary",
      created_at AS "createdAt",
      scheduled_for AS "scheduledFor",
      status,
      last_error AS "lastError",
      source,
      source_activity_id AS "sourceActivityId"
    FROM scheduled_messages
  `;

  const listRows = SqlSchema.findAll({
    Request: OptionalThreadInput,
    Result: ScheduledMessageDbRow,
    execute: ({ threadId }) =>
      threadId === undefined
        ? sql`${rowColumns} ORDER BY scheduled_for ASC, created_at ASC, id ASC`
        : sql`${rowColumns} WHERE thread_id = ${threadId} ORDER BY scheduled_for ASC, created_at ASC, id ASC`,
  });

  const getRow = SqlSchema.findOneOption({
    Request: IdInput,
    Result: ScheduledMessageDbRow,
    execute: ({ id }) => sql`${rowColumns} WHERE id = ${id} LIMIT 1`,
  });

  const insertRow = SqlSchema.findOne({
    Request: ScheduledMessageRepositoryCreateInput,
    Result: ScheduledMessageDbRow,
    execute: (row) =>
      sql`
        INSERT INTO scheduled_messages (
          id, thread_id, text, outgoing_text, title_seed, model_selection_json,
          runtime_mode, interaction_mode, attachments_json, summary_json, created_at,
          scheduled_for, status, last_error, source, source_activity_id, client_request_id, updated_at
        )
        VALUES (
          ${row.id}, ${row.threadId}, ${row.text}, ${row.outgoingText}, ${row.titleSeed},
          ${JSON.stringify(row.modelSelection)}, ${row.runtimeMode}, ${row.interactionMode},
          ${row.attachments === undefined ? null : JSON.stringify(row.attachments)},
          ${row.summary === undefined ? null : JSON.stringify(row.summary)}, ${row.createdAt},
          ${row.scheduledFor}, ${row.status}, ${row.lastError ?? null}, ${row.source ?? null},
          ${row.sourceActivityId ?? null}, ${row.clientRequestId ?? null}, ${row.createdAt}
        )
        ON CONFLICT(client_request_id) WHERE client_request_id IS NOT NULL DO UPDATE SET
          client_request_id = excluded.client_request_id
        RETURNING
          id,
          thread_id AS "threadId",
          text,
          outgoing_text AS "outgoingText",
          title_seed AS "titleSeed",
          model_selection_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          attachments_json AS "attachments",
          summary_json AS "summary",
          created_at AS "createdAt",
          scheduled_for AS "scheduledFor",
          status,
          last_error AS "lastError",
          source,
          source_activity_id AS "sourceActivityId"
      `,
  });

  const upsertRow = SqlSchema.findOne({
    Request: ScheduledMessage,
    Result: ScheduledMessageDbRow,
    execute: (row) =>
      sql`
        INSERT INTO scheduled_messages (
          id, thread_id, text, outgoing_text, title_seed, model_selection_json,
          runtime_mode, interaction_mode, attachments_json, summary_json, created_at,
          scheduled_for, status, last_error, source, source_activity_id, updated_at
        )
        VALUES (
          ${row.id}, ${row.threadId}, ${row.text}, ${row.outgoingText}, ${row.titleSeed},
          ${JSON.stringify(row.modelSelection)}, ${row.runtimeMode}, ${row.interactionMode},
          ${row.attachments === undefined ? null : JSON.stringify(row.attachments)},
          ${row.summary === undefined ? null : JSON.stringify(row.summary)}, ${row.createdAt},
          ${row.scheduledFor}, ${row.status}, ${row.lastError ?? null}, ${row.source ?? null},
          ${row.sourceActivityId ?? null}, ${row.createdAt}
        )
        ON CONFLICT(id) DO UPDATE SET
          thread_id = excluded.thread_id,
          text = excluded.text,
          outgoing_text = excluded.outgoing_text,
          title_seed = excluded.title_seed,
          model_selection_json = excluded.model_selection_json,
          runtime_mode = excluded.runtime_mode,
          interaction_mode = excluded.interaction_mode,
          attachments_json = excluded.attachments_json,
          summary_json = excluded.summary_json,
          scheduled_for = excluded.scheduled_for,
          status = excluded.status,
          last_error = excluded.last_error,
          source = excluded.source,
          source_activity_id = excluded.source_activity_id,
          updated_at = excluded.updated_at
        RETURNING
          id,
          thread_id AS "threadId",
          text,
          outgoing_text AS "outgoingText",
          title_seed AS "titleSeed",
          model_selection_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          attachments_json AS "attachments",
          summary_json AS "summary",
          created_at AS "createdAt",
          scheduled_for AS "scheduledFor",
          status,
          last_error AS "lastError",
          source,
          source_activity_id AS "sourceActivityId"
      `,
  });

  const removeRow = SqlSchema.void({
    Request: IdInput,
    execute: ({ id }) => sql`DELETE FROM scheduled_messages WHERE id = ${id}`,
  });

  const removeThreadRows = SqlSchema.void({
    Request: Schema.Struct({ threadId: ThreadId }),
    execute: ({ threadId }) => sql`DELETE FROM scheduled_messages WHERE thread_id = ${threadId}`,
  });

  const listDueRows = SqlSchema.findAll({
    Request: DueInput,
    Result: ScheduledMessageDbRow,
    execute: ({ now, limit }) =>
      sql`${rowColumns} WHERE status = 'pending' AND scheduled_for <= ${now} ORDER BY scheduled_for ASC, created_at ASC, id ASC LIMIT ${Math.max(1, Math.floor(limit))}`,
  });

  const updateStatusRow = SqlSchema.findOneOption({
    Request: StatusInput,
    Result: ScheduledMessageDbRow,
    execute: ({ id, status, lastError, updatedAt }) =>
      sql`
        UPDATE scheduled_messages
        SET status = ${status}, last_error = ${lastError}, updated_at = ${updatedAt}
        WHERE id = ${id}
        RETURNING
          id,
          thread_id AS "threadId",
          text,
          outgoing_text AS "outgoingText",
          title_seed AS "titleSeed",
          model_selection_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          attachments_json AS "attachments",
          summary_json AS "summary",
          created_at AS "createdAt",
          scheduled_for AS "scheduledFor",
          status,
          last_error AS "lastError",
          source,
          source_activity_id AS "sourceActivityId"
      `,
  });

  const expireStartupRows = SqlSchema.findAll({
    Request: Schema.Struct({ now: Schema.String }),
    Result: ScheduledMessageDbRow,
    execute: ({ now }) =>
      sql`
        UPDATE scheduled_messages
        SET
          status = 'expired',
          last_error = CASE
            WHEN status = 'sending' THEN 'Sending was interrupted before the server finished dispatching this message.'
            ELSE last_error
          END,
          updated_at = ${now}
        WHERE status = 'sending'
           OR (status = 'pending' AND scheduled_for <= ${now})
        RETURNING
          id,
          thread_id AS "threadId",
          text,
          outgoing_text AS "outgoingText",
          title_seed AS "titleSeed",
          model_selection_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          attachments_json AS "attachments",
          summary_json AS "summary",
          created_at AS "createdAt",
          scheduled_for AS "scheduledFor",
          status,
          last_error AS "lastError",
          source,
          source_activity_id AS "sourceActivityId"
      `,
  });

  const mapError = (operation: string) => Effect.mapError(toPersistenceSqlError(operation));
  const mapOptionRow = Effect.map(Option.map(toDomain));

  return ScheduledMessageRepository.of({
    list: (input) =>
      listRows(input).pipe(
        mapError("ScheduledMessageRepository.list:query"),
        Effect.map((rows) => rows.map(toDomain)),
      ),
    getById: (input) =>
      getRow(input).pipe(mapError("ScheduledMessageRepository.getById:query"), mapOptionRow),
    create: (input) =>
      insertRow(input).pipe(
        mapError("ScheduledMessageRepository.create:query"),
        Effect.map(toDomain),
      ),
    upsert: (input) =>
      upsertRow(input).pipe(
        mapError("ScheduledMessageRepository.upsert:query"),
        Effect.map(toDomain),
      ),
    remove: (input) => removeRow(input).pipe(mapError("ScheduledMessageRepository.remove:query")),
    removeByThreadId: (input) =>
      removeThreadRows(input).pipe(mapError("ScheduledMessageRepository.removeByThreadId:query")),
    listDue: (input) =>
      listDueRows(input).pipe(
        mapError("ScheduledMessageRepository.listDue:query"),
        Effect.map((rows) => rows.map(toDomain)),
      ),
    markSending: ({ id, updatedAt }) =>
      updateStatusRow({ id, status: "sending", lastError: null, updatedAt }).pipe(
        mapError("ScheduledMessageRepository.markSending:query"),
        mapOptionRow,
      ),
    markPending: ({ id, updatedAt }) =>
      updateStatusRow({ id, status: "pending", lastError: null, updatedAt }).pipe(
        mapError("ScheduledMessageRepository.markPending:query"),
        mapOptionRow,
      ),
    markFailed: ({ id, error, updatedAt }) =>
      updateStatusRow({ id, status: "failed", lastError: error, updatedAt }).pipe(
        mapError("ScheduledMessageRepository.markFailed:query"),
        mapOptionRow,
      ),
    markExpired: ({ id, error, updatedAt }) =>
      updateStatusRow({ id, status: "expired", lastError: error ?? null, updatedAt }).pipe(
        mapError("ScheduledMessageRepository.markExpired:query"),
        mapOptionRow,
      ),
    expireInterruptedAndOverdueOnStartup: (input) =>
      expireStartupRows(input).pipe(
        mapError("ScheduledMessageRepository.expireInterruptedAndOverdueOnStartup:query"),
        Effect.map((rows) => rows.map(toDomain)),
      ),
  });
});

export const ScheduledMessageRepositoryLive = Layer.effect(ScheduledMessageRepository, make);
