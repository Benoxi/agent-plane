import {
  ProviderInstanceId,
  ScheduledMessageId,
  ThreadId,
  type ScheduledMessage,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ScheduledMessageRepositoryLive } from "./ScheduledMessages.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";
import { ScheduledMessageRepository } from "../Services/ScheduledMessages.ts";

const threadId = ThreadId.make("scheduled-thread");
const otherThreadId = ThreadId.make("scheduled-thread-other");

const makeMessage = (id: string, overrides: Partial<ScheduledMessage> = {}): ScheduledMessage => ({
  id: ScheduledMessageId.make(id),
  threadId,
  text: `text ${id}`,
  outgoingText: `outgoing ${id}`,
  titleSeed: `title ${id}`,
  modelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5-codex",
  },
  runtimeMode: "full-access",
  interactionMode: "default",
  createdAt: "2026-01-01T00:00:00.000Z",
  scheduledFor: "2026-01-01T00:05:00.000Z",
  status: "pending",
  ...overrides,
});

const scheduledMessagesLayer = it.layer(
  ScheduledMessageRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

scheduledMessagesLayer("ScheduledMessageRepository", (it) => {
  it.effect("creates, lists, gets, and filters scheduled messages", () =>
    Effect.gen(function* () {
      const repository = yield* ScheduledMessageRepository;
      const first = yield* repository.create(makeMessage("scheduled-1"));
      yield* repository.create(makeMessage("scheduled-2", { threadId: otherThreadId }));

      const all = yield* repository.list({});
      const byThread = yield* repository.list({ threadId });
      const found = yield* repository.getById({ id: first.id });

      assert.strictEqual(all.length, 2);
      assert.deepStrictEqual(
        byThread.map((item) => item.id),
        [first.id],
      );
      assert.deepStrictEqual(Option.getOrNull(found)?.id, first.id);
    }),
  );

  it.effect("orders due items and transitions statuses", () =>
    Effect.gen(function* () {
      const repository = yield* ScheduledMessageRepository;
      const later = yield* repository.create(
        makeMessage("scheduled-later", { scheduledFor: "2026-01-01T00:03:00.000Z" }),
      );
      const earlier = yield* repository.create(
        makeMessage("scheduled-earlier", { scheduledFor: "2026-01-01T00:02:00.000Z" }),
      );
      yield* repository.create(
        makeMessage("scheduled-future", { scheduledFor: "2026-01-01T00:10:00.000Z" }),
      );

      const due = yield* repository.listDue({
        now: "2026-01-01T00:05:00.000Z",
        limit: 2,
      });
      assert.deepStrictEqual(
        due.map((item) => item.id),
        [earlier.id, later.id],
      );

      const sending = yield* repository.markSending({
        id: earlier.id,
        updatedAt: "2026-01-01T00:05:01.000Z",
      });
      assert.strictEqual(Option.getOrThrow(sending).status, "sending");

      const pending = yield* repository.markPending({
        id: earlier.id,
        updatedAt: "2026-01-01T00:05:02.000Z",
      });
      assert.strictEqual(Option.getOrThrow(pending).status, "pending");

      const failed = yield* repository.markFailed({
        id: earlier.id,
        error: "send failed",
        updatedAt: "2026-01-01T00:05:03.000Z",
      });
      assert.strictEqual(Option.getOrThrow(failed).status, "failed");
      assert.strictEqual(Option.getOrThrow(failed).lastError, "send failed");

      const expired = yield* repository.markExpired({
        id: later.id,
        updatedAt: "2026-01-01T00:05:04.000Z",
      });
      assert.strictEqual(Option.getOrThrow(expired).status, "expired");
    }),
  );

  it.effect("is idempotent by clientRequestId", () =>
    Effect.gen(function* () {
      const repository = yield* ScheduledMessageRepository;
      const requestThreadId = ThreadId.make("scheduled-thread-request");
      const first = yield* repository.create({
        ...makeMessage("scheduled-request-1", { threadId: requestThreadId }),
        clientRequestId: "request-1",
      });
      const duplicate = yield* repository.create({
        ...makeMessage("scheduled-request-2", { threadId: requestThreadId, text: "different" }),
        clientRequestId: "request-1",
      });

      assert.strictEqual(duplicate.id, first.id);
      assert.strictEqual(duplicate.text, first.text);
      assert.strictEqual((yield* repository.list({ threadId: requestThreadId })).length, 1);
    }),
  );

  it.effect("removes by id and by thread id", () =>
    Effect.gen(function* () {
      const repository = yield* ScheduledMessageRepository;
      const removeThreadId = ThreadId.make("scheduled-thread-remove");
      const removeOtherThreadId = ThreadId.make("scheduled-thread-remove-other");
      const first = yield* repository.create(
        makeMessage("scheduled-remove-1", { threadId: removeThreadId }),
      );
      yield* repository.create(
        makeMessage("scheduled-remove-2", { threadId: removeOtherThreadId }),
      );

      yield* repository.remove({ id: first.id });
      assert.strictEqual((yield* repository.list({ threadId: removeThreadId })).length, 0);
      assert.strictEqual((yield* repository.list({ threadId: removeOtherThreadId })).length, 1);

      yield* repository.removeByThreadId({ threadId: removeOtherThreadId });
      assert.strictEqual((yield* repository.list({ threadId: removeOtherThreadId })).length, 0);
    }),
  );

  it.effect("expires interrupted and overdue messages on startup", () =>
    Effect.gen(function* () {
      const repository = yield* ScheduledMessageRepository;
      yield* repository.create(
        makeMessage("scheduled-startup-pending", {
          scheduledFor: "2026-01-01T00:00:00.000Z",
        }),
      );
      yield* repository.create(
        makeMessage("scheduled-startup-sending", {
          scheduledFor: "2026-01-01T00:10:00.000Z",
          status: "sending",
        }),
      );
      yield* repository.create(
        makeMessage("scheduled-startup-future", {
          scheduledFor: "2026-01-01T01:00:00.000Z",
        }),
      );

      const expired = yield* repository.expireInterruptedAndOverdueOnStartup({
        now: "2026-01-01T00:30:00.000Z",
      });

      const expiredIds = new Set(expired.map((item) => item.id));
      assert.strictEqual(
        expiredIds.has(ScheduledMessageId.make("scheduled-startup-pending")),
        true,
      );
      assert.strictEqual(
        expiredIds.has(ScheduledMessageId.make("scheduled-startup-sending")),
        true,
      );
      const startupThreadItems = yield* repository.list({ threadId });
      assert.strictEqual(
        startupThreadItems.some(
          (item) =>
            item.id === ScheduledMessageId.make("scheduled-startup-pending") &&
            item.status === "pending",
        ),
        false,
      );
    }),
  );
});
