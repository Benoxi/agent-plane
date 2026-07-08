import {
  IsoDateTime,
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ScheduledMessage,
  ScheduledMessageId,
  ScheduledMessageSource,
  ScheduledMessageStatus,
  ScheduledMessageSummary,
  ThreadId,
  TrimmedNonEmptyString,
  UploadChatAttachment,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ScheduledMessageRepositoryCreateInput = Schema.Struct({
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
  clientRequestId: Schema.optional(TrimmedNonEmptyString),
});
export type ScheduledMessageRepositoryCreateInput =
  typeof ScheduledMessageRepositoryCreateInput.Type;

export interface ScheduledMessageRepositoryShape {
  readonly list: (input: {
    readonly threadId?: ThreadId;
  }) => Effect.Effect<ReadonlyArray<ScheduledMessage>, ProjectionRepositoryError>;
  readonly getById: (input: {
    readonly id: ScheduledMessageId;
  }) => Effect.Effect<Option.Option<ScheduledMessage>, ProjectionRepositoryError>;
  readonly create: (
    input: ScheduledMessageRepositoryCreateInput,
  ) => Effect.Effect<ScheduledMessage, ProjectionRepositoryError>;
  readonly upsert: (
    input: ScheduledMessage,
  ) => Effect.Effect<ScheduledMessage, ProjectionRepositoryError>;
  readonly remove: (input: {
    readonly id: ScheduledMessageId;
  }) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly removeByThreadId: (input: {
    readonly threadId: ThreadId;
  }) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly listDue: (input: {
    readonly now: string;
    readonly limit: number;
  }) => Effect.Effect<ReadonlyArray<ScheduledMessage>, ProjectionRepositoryError>;
  readonly markSending: (input: {
    readonly id: ScheduledMessageId;
    readonly updatedAt: string;
  }) => Effect.Effect<Option.Option<ScheduledMessage>, ProjectionRepositoryError>;
  readonly markPending: (input: {
    readonly id: ScheduledMessageId;
    readonly updatedAt: string;
  }) => Effect.Effect<Option.Option<ScheduledMessage>, ProjectionRepositoryError>;
  readonly markFailed: (input: {
    readonly id: ScheduledMessageId;
    readonly error: string;
    readonly updatedAt: string;
  }) => Effect.Effect<Option.Option<ScheduledMessage>, ProjectionRepositoryError>;
  readonly markExpired: (input: {
    readonly id: ScheduledMessageId;
    readonly error?: string;
    readonly updatedAt: string;
  }) => Effect.Effect<Option.Option<ScheduledMessage>, ProjectionRepositoryError>;
  readonly expireInterruptedAndOverdueOnStartup: (input: {
    readonly now: string;
  }) => Effect.Effect<ReadonlyArray<ScheduledMessage>, ProjectionRepositoryError>;
}

export class ScheduledMessageRepository extends Context.Service<
  ScheduledMessageRepository,
  ScheduledMessageRepositoryShape
>()("t3/persistence/Services/ScheduledMessages/ScheduledMessageRepository") {}
