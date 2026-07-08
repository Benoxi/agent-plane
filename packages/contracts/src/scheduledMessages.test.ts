import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  ScheduledMessage,
  ScheduledMessagesStreamEvent,
  type ScheduledMessage as ScheduledMessageType,
} from "./scheduledMessages.ts";

const baseMessage = {
  id: "scheduled-1",
  threadId: "thread-1",
  text: "hello",
  outgoingText: "hello",
  titleSeed: "Thread",
  modelSelection: { instanceId: "codex", model: "gpt-5.4" },
  runtimeMode: "full-access",
  interactionMode: "default",
  createdAt: "2026-07-05T10:00:00.000Z",
  scheduledFor: "2026-07-05T10:05:00.000Z",
  status: "pending",
} satisfies typeof ScheduledMessage.Encoded;

const decodeScheduledMessage = Schema.decodeUnknownEffect(ScheduledMessage);
const decodeScheduledMessagesStreamEvent = Schema.decodeUnknownEffect(ScheduledMessagesStreamEvent);

it.effect("decodes a valid pending scheduled message", () =>
  Effect.gen(function* () {
    const decoded = yield* decodeScheduledMessage(baseMessage);
    assert.strictEqual(decoded.id, "scheduled-1" as ScheduledMessageType["id"]);
    assert.strictEqual(decoded.status, "pending");
  }),
);

it.effect("decodes optional rich payload fields", () =>
  Effect.gen(function* () {
    const decoded = yield* decodeScheduledMessage({
      ...baseMessage,
      attachments: [
        {
          type: "image",
          name: "image.png",
          mimeType: "image/png",
          sizeBytes: 100,
          dataUrl: "data:image/png;base64,AAAA",
        },
      ],
      summary: { label: "Later" },
      source: "manual",
      sourceActivityId: "activity-1",
      lastError: "failed",
    });
    assert.strictEqual(decoded.attachments?.length, 1);
    assert.strictEqual(decoded.summary?.label, "Later");
  }),
);

it.effect("decodes scheduled-message stream events", () =>
  Effect.gen(function* () {
    assert.strictEqual(
      (yield* decodeScheduledMessagesStreamEvent({ type: "snapshot", items: [baseMessage] })).type,
      "snapshot",
    );
    assert.strictEqual(
      (yield* decodeScheduledMessagesStreamEvent({ type: "upserted", item: baseMessage })).type,
      "upserted",
    );
    assert.strictEqual(
      (yield* decodeScheduledMessagesStreamEvent({ type: "removed", messageId: "scheduled-1" }))
        .type,
      "removed",
    );
  }),
);
