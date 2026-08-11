import { describe, expect, it } from "vite-plus/test";

import {
  planPinnedMove,
  sortPinnedThreadsByOrderKey,
  sortThreads,
  type ThreadSortInput,
} from "./threadSort.ts";

type TestThread = { readonly id: string } & ThreadSortInput;

function makeThread(overrides: Partial<TestThread> = {}): TestThread {
  return {
    id: "thread-1",
    createdAt: "2026-03-09T10:00:00.000Z",
    updatedAt: "2026-03-09T10:00:00.000Z",
    latestUserMessageAt: null,
    messages: [],
    ...overrides,
  };
}

describe("sortThreads", () => {
  it("sorts recency by the latest projected user activity", () => {
    const sorted = sortThreads(
      [
        makeThread({
          id: "thread-1",
          createdAt: "2026-03-09T10:00:00.000Z",
          updatedAt: "2026-03-09T10:40:00.000Z",
          latestUserMessageAt: "2026-03-09T10:10:00.000Z",
        }),
        makeThread({
          id: "thread-2",
          createdAt: "2026-03-09T10:05:00.000Z",
          updatedAt: "2026-03-09T10:20:00.000Z",
          latestUserMessageAt: "2026-03-09T10:15:00.000Z",
        }),
      ],
      "updated_at",
    );

    expect(sorted.map((thread) => thread.id)).toEqual(["thread-2", "thread-1"]);
  });

  it("does not reorder for assistant, status, or title updates", () => {
    const sorted = sortThreads(
      [
        makeThread({
          id: "older-user-activity",
          createdAt: "2026-03-09T10:00:00.000Z",
          latestUserMessageAt: "2026-03-09T10:05:00.000Z",
          updatedAt: "2026-03-09T11:00:00.000Z",
        }),
        makeThread({
          id: "newer-user-activity",
          createdAt: "2026-03-09T10:10:00.000Z",
          latestUserMessageAt: "2026-03-09T10:15:00.000Z",
          updatedAt: "2026-03-09T10:15:00.000Z",
        }),
      ],
      "updated_at",
    );

    expect(sorted.map((thread) => thread.id)).toEqual([
      "newer-user-activity",
      "older-user-activity",
    ]);
  });

  it("derives user activity from loaded messages when the projection is missing", () => {
    const sorted = sortThreads(
      [
        makeThread({
          id: "derived-user-activity",
          latestUserMessageAt: null,
          messages: [
            { role: "user", createdAt: "2026-03-09T10:05:00.000Z" },
            { role: "assistant", createdAt: "2026-03-09T10:30:00.000Z" },
            { role: "user", createdAt: "2026-03-09T10:20:00.000Z" },
          ],
        }),
        makeThread({
          id: "projected-user-activity",
          latestUserMessageAt: "2026-03-09T10:15:00.000Z",
        }),
      ],
      "updated_at",
    );

    expect(sorted.map((thread) => thread.id)).toEqual([
      "derived-user-activity",
      "projected-user-activity",
    ]);
  });

  it("uses stable creation time when a thread has no user activity", () => {
    const sorted = sortThreads(
      [
        makeThread({
          id: "renamed-old-thread",
          createdAt: "2026-03-09T09:00:00.000Z",
          updatedAt: "2026-03-09T12:00:00.000Z",
        }),
        makeThread({
          id: "new-thread",
          createdAt: "2026-03-09T10:00:00.000Z",
          updatedAt: "2026-03-09T10:00:00.000Z",
        }),
      ],
      "updated_at",
    );

    expect(sorted.map((thread) => thread.id)).toEqual(["new-thread", "renamed-old-thread"]);
  });

  it("uses creation time and then id as deterministic equal-activity tie-breakers", () => {
    const sorted = sortThreads(
      [
        makeThread({
          id: "thread-1",
          createdAt: "2026-03-09T10:05:00.000Z",
          updatedAt: "2026-03-09T10:30:00.000Z",
          latestUserMessageAt: "2026-03-09T10:30:00.000Z",
        }),
        makeThread({
          id: "thread-2",
          createdAt: "2026-03-09T10:06:00.000Z",
          updatedAt: "2026-03-09T10:30:00.000Z",
          latestUserMessageAt: "2026-03-09T10:30:00.000Z",
        }),
        makeThread({
          id: "thread-3",
          createdAt: "2026-03-09T10:06:00.000Z",
          updatedAt: "2026-03-09T10:30:00.000Z",
          latestUserMessageAt: "2026-03-09T10:30:00.000Z",
        }),
      ],
      "updated_at",
    );

    expect(sorted.map((thread) => thread.id)).toEqual(["thread-3", "thread-2", "thread-1"]);
  });

  it("produces the same order for cloned reconnect snapshots and imported threads", () => {
    const threads = [
      makeThread({
        id: "existing",
        latestUserMessageAt: "2026-03-09T10:10:00.000Z",
      }),
      makeThread({
        id: "imported",
        latestUserMessageAt: "2026-03-09T10:20:00.000Z",
      }),
    ];

    expect(sortThreads(threads, "updated_at").map((thread) => thread.id)).toEqual([
      "imported",
      "existing",
    ]);
    expect(
      sortThreads(
        threads.map((thread) => ({ ...thread })),
        "updated_at",
      ).map((thread) => thread.id),
    ).toEqual(["imported", "existing"]);
  });
});

describe("planPinnedMove", () => {
  it("moves a thread up with a single key write", () => {
    const assignments = planPinnedMove({
      orderedIds: ["a", "b", "c"],
      keysById: new Map([
        ["a", "f"],
        ["b", "m"],
        ["c", "t"],
      ]),
      movedId: "c",
      direction: "up",
    });
    expect(assignments).toHaveLength(1);
    expect(assignments![0]!.id).toBe("c");
    expect(assignments![0]!.orderKey > "f" && assignments![0]!.orderKey < "m").toBe(true);
  });

  it("returns null when the move falls off the end of the list", () => {
    const input = {
      orderedIds: ["a", "b"],
      keysById: new Map([
        ["a", "f"],
        ["b", "m"],
      ]),
    };
    expect(planPinnedMove({ ...input, movedId: "a", direction: "up" })).toBeNull();
    expect(planPinnedMove({ ...input, movedId: "b", direction: "down" })).toBeNull();
  });

  it("materializes keys for the whole section when a neighbor is keyless", () => {
    const assignments = planPinnedMove({
      orderedIds: ["a", "b", "c"],
      keysById: new Map([
        ["a", null],
        ["b", "m"],
        ["c", null],
      ]),
      movedId: "b",
      direction: "up",
    });
    expect(assignments).not.toBeNull();
    const keys = assignments!.map((entry) => entry.orderKey);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("sortPinnedThreadsByOrderKey", () => {
  it("breaks equal keys by id THEN environment so merged lists are stable everywhere", () => {
    const sorted = sortPinnedThreadsByOrderKey([
      {
        id: "thread-1",
        createdAt: "2026-03-09T10:00:00.000Z",
        pinOrderKey: "m",
        environmentId: "env-b",
      },
      {
        id: "thread-1",
        createdAt: "2026-03-09T11:00:00.000Z",
        pinOrderKey: "m",
        environmentId: "env-a",
      },
    ]);
    expect(sorted.map((thread) => thread.environmentId)).toEqual(["env-a", "env-b"]);
  });
});
