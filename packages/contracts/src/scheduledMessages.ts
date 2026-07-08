import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  PositiveInt,
  ScheduledMessageId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  UploadChatAttachment,
} from "./orchestration.ts";

export const ScheduledMessageStatus = Schema.Literals(["pending", "sending", "failed", "expired"]);
export type ScheduledMessageStatus = typeof ScheduledMessageStatus.Type;

export const ScheduledMessageSource = Schema.Literals(["manual", "rate-limit-auto-continue"]);
export type ScheduledMessageSource = typeof ScheduledMessageSource.Type;

export const ScheduledMessageSummary = Schema.Struct({
  label: Schema.optional(Schema.String),
});
export type ScheduledMessageSummary = typeof ScheduledMessageSummary.Type;

export const ScheduledMessage = Schema.Struct({
  id: ScheduledMessageId,
  threadId: ThreadId,
  text: Schema.String,
  outgoingText: Schema.String,
  titleSeed: Schema.String,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  attachments: Schema.optional(Schema.Array(UploadChatAttachment)),
  summary: Schema.optional(ScheduledMessageSummary),
  createdAt: IsoDateTime,
  scheduledFor: IsoDateTime,
  status: ScheduledMessageStatus,
  lastError: Schema.optional(Schema.String),
  source: Schema.optional(ScheduledMessageSource),
  sourceActivityId: Schema.optional(Schema.String),
});
export type ScheduledMessage = typeof ScheduledMessage.Type;

export const ScheduledMessageCreateInput = Schema.Struct({
  threadId: ThreadId,
  text: Schema.String,
  outgoingText: Schema.String,
  titleSeed: Schema.String,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  attachments: Schema.optional(Schema.Array(UploadChatAttachment)),
  summary: Schema.optional(ScheduledMessageSummary),
  delaySeconds: PositiveInt,
  source: Schema.optional(ScheduledMessageSource),
  sourceActivityId: Schema.optional(Schema.String),
  clientRequestId: Schema.optional(TrimmedNonEmptyString),
});
export type ScheduledMessageCreateInput = typeof ScheduledMessageCreateInput.Type;

export const ScheduledMessageDeleteInput = Schema.Struct({
  messageId: ScheduledMessageId,
});
export type ScheduledMessageDeleteInput = typeof ScheduledMessageDeleteInput.Type;

export const ScheduledMessagesListInput = Schema.Struct({
  threadId: Schema.optional(ThreadId),
});
export type ScheduledMessagesListInput = typeof ScheduledMessagesListInput.Type;

export const ScheduledMessagesListResult = Schema.Struct({
  items: Schema.Array(ScheduledMessage),
});
export type ScheduledMessagesListResult = typeof ScheduledMessagesListResult.Type;

export const ScheduledMessagesStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    items: Schema.Array(ScheduledMessage),
  }),
  Schema.Struct({
    type: Schema.Literal("upserted"),
    item: ScheduledMessage,
  }),
  Schema.Struct({
    type: Schema.Literal("removed"),
    messageId: ScheduledMessageId,
  }),
]);
export type ScheduledMessagesStreamEvent = typeof ScheduledMessagesStreamEvent.Type;

export class ScheduledMessageOperationError extends Schema.TaggedErrorClass<ScheduledMessageOperationError>()(
  "ScheduledMessageOperationError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
