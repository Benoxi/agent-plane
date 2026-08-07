import { describe, expect, it } from "vite-plus/test";

import { sortThreads, type ThreadSortInput } from "./threadSort.ts";

type TestThread = { readonly id: string } & ThreadSortInput;

function makeThread(overrides: Partial<TestThread> = {}): TestThread {
  return {
    id: "thread-1",
    createdAt: "2026-03-09T10:00:00.000Z",
    updatedAt: "2026-03-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("sortThreads", () => {
  it("sorts recency by meaningful thread updates rather than only user messages", () => {
    const sorted = sortThreads(
      [
        makeThread({
          id: "thread-1",
          createdAt: "2026-03-09T10:00:00.000Z",
          updatedAt: "2026-03-09T10:20:00.000Z",
        }),
        makeThread({
          id: "thread-2",
          createdAt: "2026-03-09T10:05:00.000Z",
          updatedAt: "2026-03-09T10:30:00.000Z",
        }),
      ],
      "updated_at",
    );

    expect(sorted.map((thread) => thread.id)).toEqual(["thread-2", "thread-1"]);
  });

  it("uses created time and then id as deterministic equal-timestamp tie-breakers", () => {
    const sorted = sortThreads(
      [
        makeThread({
          id: "thread-1",
          createdAt: "2026-03-09T10:05:00.000Z",
          updatedAt: "2026-03-09T10:30:00.000Z",
        }),
        makeThread({
          id: "thread-2",
          createdAt: "2026-03-09T10:06:00.000Z",
          updatedAt: "2026-03-09T10:30:00.000Z",
        }),
        makeThread({
          id: "thread-3",
          createdAt: "2026-03-09T10:06:00.000Z",
          updatedAt: "2026-03-09T10:30:00.000Z",
        }),
      ],
      "updated_at",
    );

    expect(sorted.map((thread) => thread.id)).toEqual(["thread-3", "thread-2", "thread-1"]);
  });

  it("produces the same order for cloned reconnect snapshots and imported threads", () => {
    const threads = [
      makeThread({ id: "existing", updatedAt: "2026-03-09T10:10:00.000Z" }),
      makeThread({ id: "imported", updatedAt: "2026-03-09T10:20:00.000Z" }),
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
