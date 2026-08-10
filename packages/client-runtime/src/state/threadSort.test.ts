import { describe, expect, it } from "vite-plus/test";

import { sortThreads, type ThreadSortInput } from "./threadSort.ts";

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
