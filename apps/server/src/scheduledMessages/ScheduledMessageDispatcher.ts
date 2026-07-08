import {
  CommandId,
  MessageId,
  ScheduledMessageId,
  type ScheduledMessage,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import * as OrchestrationEngine from "../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ScheduledMessageRepository } from "../persistence/Services/ScheduledMessages.ts";
import { ScheduledMessageBus } from "./ScheduledMessageBus.ts";

const DISPATCH_LIMIT = 25;
const IDLE_POLL_MS = 5_000;

export interface ScheduledMessageDispatcherShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly drainOnce: Effect.Effect<void>;
}

export class ScheduledMessageDispatcher extends Context.Service<
  ScheduledMessageDispatcher,
  ScheduledMessageDispatcherShape
>()("t3/scheduledMessages/ScheduledMessageDispatcher") {}

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

function isThreadReady(session: { readonly status: string } | null): boolean {
  return session?.status === "idle" || session?.status === "ready";
}

const make = Effect.gen(function* () {
  const repository = yield* ScheduledMessageRepository;
  const bus = yield* ScheduledMessageBus;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const orchestrationEngine = yield* OrchestrationEngine.OrchestrationEngineService;
  const crypto = yield* Crypto.Crypto;

  const randomId = crypto.randomUUIDv4;
  const serverCommandId = (tag: string) =>
    randomId.pipe(Effect.map((uuid) => CommandId.make(`server:scheduled-message:${tag}:${uuid}`)));
  const messageId = () => randomId.pipe(Effect.map((uuid) => MessageId.make(uuid)));
  const attachmentId = () => randomId.pipe(Effect.map((uuid) => `scheduled-${uuid}`));

  const publishUpsert = (item: ScheduledMessage) =>
    bus.publish({ type: "upserted", item }).pipe(Effect.ignore);
  const publishRemoved = (messageId: ScheduledMessageId) =>
    bus.publish({ type: "removed", messageId }).pipe(Effect.ignore);

  const expireStartup = Effect.gen(function* () {
    const expired = yield* repository.expireInterruptedAndOverdueOnStartup({ now: yield* nowIso });
    yield* Effect.forEach(expired, publishUpsert, { discard: true });
  });

  const dispatchItem = Effect.fn("ScheduledMessageDispatcher.dispatchItem")(function* (
    item: ScheduledMessage,
  ) {
    const thread = yield* projectionSnapshotQuery.getThreadShellById(item.threadId);
    if (Option.isNone(thread)) {
      yield* repository.remove({ id: item.id });
      yield* publishRemoved(item.id);
      return;
    }
    if (!isThreadReady(thread.value.session)) {
      return;
    }

    const sending = yield* repository.markSending({ id: item.id, updatedAt: yield* nowIso });
    if (Option.isNone(sending)) {
      return;
    }
    yield* publishUpsert(sending.value);

    const createdAt = yield* nowIso;
    const attachments = yield* Effect.forEach(item.attachments ?? [], (attachment) =>
      Effect.gen(function* () {
        switch (attachment.type) {
          case "image":
            return {
              type: "image" as const,
              id: yield* attachmentId(),
              name: attachment.name,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
            };
        }
      }),
    );
    const command = {
      type: "thread.turn.start" as const,
      commandId: yield* serverCommandId("turn-start"),
      threadId: item.threadId,
      message: {
        messageId: yield* messageId(),
        role: "user" as const,
        text: item.outgoingText,
        attachments,
      },
      modelSelection: item.modelSelection,
      titleSeed: item.titleSeed,
      runtimeMode: item.runtimeMode,
      interactionMode: item.interactionMode,
      createdAt,
    };

    yield* orchestrationEngine.dispatch(command).pipe(
      Effect.tap(() => repository.remove({ id: item.id })),
      Effect.tap(() => publishRemoved(item.id)),
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return repository
            .markPending({ id: item.id, updatedAt: createdAt })
            .pipe(
              Effect.flatMap((updated) =>
                Option.isSome(updated) ? publishUpsert(updated.value) : Effect.void,
              ),
            );
        }
        const error = Cause.squash(cause);
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to send scheduled message.";
        return repository
          .markFailed({ id: item.id, error: message, updatedAt: createdAt })
          .pipe(
            Effect.flatMap((updated) =>
              Option.isSome(updated) ? publishUpsert(updated.value) : Effect.void,
            ),
          );
      }),
    );
  });

  const drainOnce = Effect.gen(function* () {
    const now = yield* nowIso;
    const dueItems = yield* repository.listDue({ now, limit: DISPATCH_LIMIT });
    yield* Effect.forEach(dueItems, dispatchItem, { discard: true, concurrency: 1 });
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause)
        : Effect.logWarning("scheduled message dispatch loop failed", {
            cause: Cause.pretty(cause),
          }),
    ),
    Effect.ignore,
  );

  const loop = Effect.forever(
    drainOnce.pipe(
      Effect.andThen(
        Stream.runDrain(Stream.take(bus.wakeups, 1)).pipe(
          Effect.timeout(`${IDLE_POLL_MS} millis`),
          Effect.ignore,
        ),
      ),
    ),
  ).pipe(Effect.ignore);

  const start: ScheduledMessageDispatcherShape["start"] = Effect.fn("start")(function* () {
    yield* expireStartup.pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.void
          : Effect.logWarning("scheduled message startup expiration failed", {
              cause: Cause.pretty(cause),
            }),
      ),
      Effect.ignore,
    );
    yield* Effect.forkScoped(loop);
  });

  return ScheduledMessageDispatcher.of({
    start,
    drainOnce,
  });
});

export const layer = Layer.effect(ScheduledMessageDispatcher, make);

export const startScheduledMessageDispatcher = make.pipe(
  Effect.flatMap((service) => service.start()),
);
