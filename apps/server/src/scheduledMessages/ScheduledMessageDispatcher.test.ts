import {
  ProviderInstanceId,
  ScheduledMessageId,
  ThreadId,
  type ScheduledMessage,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import * as OrchestrationEngine from "../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ScheduledMessageRepository } from "../persistence/Services/ScheduledMessages.ts";
import { ScheduledMessageBus } from "./ScheduledMessageBus.ts";
import {
  layer as ScheduledMessageDispatcherLive,
  ScheduledMessageDispatcher,
} from "./ScheduledMessageDispatcher.ts";

const threadId = ThreadId.make("scheduled-dispatch-thread");

const message: ScheduledMessage = {
  id: ScheduledMessageId.make("scheduled-dispatch-message"),
  threadId,
  text: "hello",
  outgoingText: "hello",
  titleSeed: "hello",
  modelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5-codex",
  },
  runtimeMode: "full-access",
  interactionMode: "default",
  createdAt: "2026-01-01T00:00:00.000Z",
  scheduledFor: "2026-01-01T00:00:01.000Z",
  status: "pending",
};

const testCrypto = {
  randomUUIDv4: Effect.succeed("00000000-0000-4000-8000-000000000001"),
  randomUUID: Effect.succeed("00000000-0000-4000-8000-000000000001"),
} as never;

class TestDispatchError extends Data.TaggedError("TestDispatchError")<{
  readonly message: string;
}> {}

interface DispatcherTestOptions {
  readonly dueItems?: ReadonlyArray<ScheduledMessage>;
  readonly threadSessionStatus?: string | null;
  readonly dispatch?: Effect.Effect<unknown, TestDispatchError>;
}

const makeDispatcherTest = (options: DispatcherTestOptions = {}) =>
  Effect.gen(function* () {
    const removed = yield* Ref.make<ReadonlyArray<ScheduledMessageId>>([]);
    const failed = yield* Ref.make<ReadonlyArray<string>>([]);
    const dispatched = yield* Ref.make(0);
    const expiredOnStartup = yield* Ref.make(false);
    const published = yield* Ref.make(0);

    const layer = ScheduledMessageDispatcherLive.pipe(
      Layer.provide(
        Layer.succeed(ScheduledMessageRepository, {
          list: () => Effect.succeed([]),
          getById: () => Effect.succeed(Option.none()),
          create: (input) => Effect.succeed(input as ScheduledMessage),
          upsert: (input) => Effect.succeed(input),
          remove: ({ id }) => Ref.update(removed, (ids) => [...ids, id]),
          removeByThreadId: () => Effect.void,
          listDue: () => Effect.succeed([...(options.dueItems ?? [message])]),
          markSending: ({ id }) =>
            Effect.succeed(
              id === message.id
                ? Option.some({ ...message, status: "sending" as const })
                : Option.none(),
            ),
          markPending: ({ id }) =>
            Effect.succeed(
              id === message.id
                ? Option.some({ ...message, status: "pending" as const })
                : Option.none(),
            ),
          markFailed: ({ id, error }) =>
            Ref.update(failed, (errors) => [...errors, error]).pipe(
              Effect.as(
                id === message.id
                  ? Option.some({ ...message, status: "failed" as const, lastError: error })
                  : Option.none(),
              ),
            ),
          markExpired: () => Effect.succeed(Option.none()),
          expireInterruptedAndOverdueOnStartup: () =>
            Ref.set(expiredOnStartup, true).pipe(Effect.as([])),
        }),
      ),
      Layer.provide(
        Layer.succeed(ScheduledMessageBus, {
          publish: () => Ref.update(published, (count) => count + 1),
          stream: Stream.empty,
          wake: Effect.void,
          wakeups: Stream.empty,
        }),
      ),
      Layer.provide(
        Layer.succeed(ProjectionSnapshotQuery.ProjectionSnapshotQuery, {
          getThreadShellById: () =>
            options.threadSessionStatus === null
              ? Effect.succeed(Option.none())
              : Effect.succeed(
                  Option.some({
                    id: threadId,
                    session:
                      options.threadSessionStatus === undefined
                        ? { status: "idle" }
                        : { status: options.threadSessionStatus },
                  } as never),
                ),
        } as never),
      ),
      Layer.provide(
        Layer.succeed(OrchestrationEngine.OrchestrationEngineService, {
          dispatch: () =>
            Ref.update(dispatched, (count) => count + 1).pipe(
              Effect.andThen(options.dispatch ?? Effect.succeed({ sequence: 1 })),
            ),
          readEvents: () => Stream.empty,
          streamDomainEvents: Stream.empty,
        } as never),
      ),
      Layer.provide(Layer.succeed(Crypto.Crypto, testCrypto)),
    );

    const dispatcher = yield* ScheduledMessageDispatcher.pipe(Effect.provide(layer));
    return {
      dispatcher,
      removed,
      failed,
      dispatched,
      expiredOnStartup,
      published,
    };
  });

it.effect("sends due pending items when the thread is ready", () =>
  Effect.gen(function* () {
    const test = yield* makeDispatcherTest();

    yield* test.dispatcher.drainOnce;

    assert.strictEqual(yield* Ref.get(test.dispatched), 1);
    assert.deepStrictEqual(yield* Ref.get(test.removed), [message.id]);
  }),
);

it.effect("does not send future items", () =>
  Effect.gen(function* () {
    const test = yield* makeDispatcherTest({ dueItems: [] });

    yield* test.dispatcher.drainOnce;

    assert.strictEqual(yield* Ref.get(test.dispatched), 0);
    assert.deepStrictEqual(yield* Ref.get(test.removed), []);
  }),
);

it.effect("waits while the thread is busy", () =>
  Effect.gen(function* () {
    const test = yield* makeDispatcherTest({ threadSessionStatus: "running" });

    yield* test.dispatcher.drainOnce;

    assert.strictEqual(yield* Ref.get(test.dispatched), 0);
    assert.deepStrictEqual(yield* Ref.get(test.removed), []);
  }),
);

it.effect("marks failed when dispatch fails", () =>
  Effect.gen(function* () {
    const test = yield* makeDispatcherTest({
      dispatch: Effect.fail(new TestDispatchError({ message: "dispatch failed" })),
    });

    yield* test.dispatcher.drainOnce;

    assert.strictEqual(yield* Ref.get(test.dispatched), 1);
    assert.deepStrictEqual(yield* Ref.get(test.failed), ["dispatch failed"]);
  }),
);

it.effect("removes items for deleted threads", () =>
  Effect.gen(function* () {
    const test = yield* makeDispatcherTest({ threadSessionStatus: null });

    yield* test.dispatcher.drainOnce;

    assert.strictEqual(yield* Ref.get(test.dispatched), 0);
    assert.deepStrictEqual(yield* Ref.get(test.removed), [message.id]);
  }),
);

it.effect("expires interrupted and overdue items on startup", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const test = yield* makeDispatcherTest({ dueItems: [] });

      yield* test.dispatcher.start();

      assert.strictEqual(yield* Ref.get(test.expiredOnStartup), true);
    }),
  ),
);
