import {
  ProviderInstanceId,
  ScheduledMessageId,
  ThreadId,
  type ScheduledMessage,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { applyScheduledMessagesStreamEvent } from "./scheduledMessages.ts";

const makeMessage = (
  id: string,
  scheduledFor: string,
  createdAt = "2026-01-01T00:00:00.000Z",
): ScheduledMessage => ({
  id: ScheduledMessageId.make(id),
  threadId: ThreadId.make("scheduled-client-thread"),
  text: id,
  outgoingText: id,
  titleSeed: id,
  modelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5-codex",
  },
  runtimeMode: "full-access",
  interactionMode: "default",
  createdAt,
  scheduledFor,
  status: "pending",
});

describe("scheduled message projection", () => {
  it("applies snapshot, upsert, and remove events in sorted order", () => {
    const later = makeMessage("later", "2026-01-01T00:02:00.000Z");
    const earlier = makeMessage("earlier", "2026-01-01T00:01:00.000Z");

    const snapshot = applyScheduledMessagesStreamEvent(Option.none(), {
      type: "snapshot",
      items: [later],
    });
    const upserted = applyScheduledMessagesStreamEvent(snapshot, {
      type: "upserted",
      item: earlier,
    });
    const removed = applyScheduledMessagesStreamEvent(upserted, {
      type: "removed",
      messageId: later.id,
    });

    expect(Option.getOrThrow(upserted).items.map((item) => item.id)).toEqual([
      earlier.id,
      later.id,
    ]);
    expect(Option.getOrThrow(removed).items.map((item) => item.id)).toEqual([earlier.id]);
  });

  it("uses created time and id as stable tie breakers", () => {
    const second = makeMessage("tie-b", "2026-01-01T00:01:00.000Z", "2026-01-01T00:00:02.000Z");
    const first = makeMessage("tie-a", "2026-01-01T00:01:00.000Z", "2026-01-01T00:00:01.000Z");

    const projection = applyScheduledMessagesStreamEvent(Option.none(), {
      type: "snapshot",
      items: [second, first],
    });

    expect(Option.getOrThrow(projection).items.map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
  });
});
