import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

async function loadStoreWithStorage(storage: Storage) {
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("localStorage", storage);
  return import("./scheduledMessageStore");
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("scheduledMessageStore", () => {
  it("stores auto-continue source metadata", async () => {
    const storage = createLocalStorageStub();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T11:00:00.000Z"));
    const store = await loadStoreWithStorage(storage);
    const environmentId = EnvironmentId.make("environment-local");
    const threadId = ThreadId.make("thread-1");

    store.scheduleThreadMessage({
      environmentId,
      threadId,
      text: "continue",
      outgoingText: "continue",
      titleSeed: "Thread",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      delaySeconds: 30,
      source: "rate-limit-auto-continue",
      sourceActivityId: "activity-1",
    });

    expect(store.readScheduledMessages()).toEqual([
      expect.objectContaining({
        source: "rate-limit-auto-continue",
        sourceActivityId: "activity-1",
      }),
    ]);
  });

  it("reads existing persisted messages without source metadata", async () => {
    const storage = createLocalStorageStub();
    storage.setItem(
      "t3code:scheduled-messages:v1",
      JSON.stringify({
        items: [
          {
            id: "manual-without-source",
            environmentId: "environment-local",
            threadId: "thread-1",
            text: "hello",
            outgoingText: "hello",
            titleSeed: "Thread",
            modelSelection: {
              instanceId: "codex",
              model: "gpt-5.4",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            createdAt: "2026-07-04T10:00:00.000Z",
            scheduledFor: "2026-07-04T11:00:00.000Z",
            status: "pending",
          },
        ],
      }),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T10:30:00.000Z"));

    const store = await loadStoreWithStorage(storage);

    const [message] = store.readScheduledMessages();
    expect(message).toEqual(expect.objectContaining({ id: "manual-without-source" }));
    expect(message?.source).toBeUndefined();
  });

  it("expires overdue pending items and interrupted sends on hydration", async () => {
    const storage = createLocalStorageStub();
    storage.setItem(
      "t3code:scheduled-messages:v1",
      JSON.stringify({
        items: [
          {
            id: "pending-overdue",
            environmentId: "environment-local",
            threadId: "thread-1",
            text: "hello",
            outgoingText: "hello",
            titleSeed: "Thread",
            modelSelection: {
              instanceId: "codex",
              model: "gpt-5.4",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            createdAt: "2026-07-04T10:00:00.000Z",
            scheduledFor: "2026-07-04T10:00:05.000Z",
            status: "pending",
          },
          {
            id: "sending",
            environmentId: "environment-local",
            threadId: "thread-1",
            text: "world",
            outgoingText: "world",
            titleSeed: "Thread",
            modelSelection: {
              instanceId: "codex",
              model: "gpt-5.4",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            createdAt: "2026-07-04T10:00:00.000Z",
            scheduledFor: "2026-07-04T10:00:20.000Z",
            status: "sending",
          },
        ],
      }),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T10:01:00.000Z"));

    const store = await loadStoreWithStorage(storage);

    expect(store.readScheduledMessages()).toEqual([
      expect.objectContaining({
        id: "pending-overdue",
        status: "expired",
      }),
      expect.objectContaining({
        id: "sending",
        status: "expired",
        lastError: expect.stringContaining("interrupted"),
      }),
    ]);
  });

  it("schedules, updates, and removes thread messages", async () => {
    const storage = createLocalStorageStub();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T11:00:00.000Z"));
    const store = await loadStoreWithStorage(storage);
    const environmentId = EnvironmentId.make("environment-local");
    const threadId = ThreadId.make("thread-1");

    const first = store.scheduleThreadMessage({
      environmentId,
      threadId,
      text: "first",
      outgoingText: "first",
      titleSeed: "Thread",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      delaySeconds: 30,
    });
    const second = store.scheduleThreadMessage({
      environmentId,
      threadId,
      text: "second",
      outgoingText: "second",
      titleSeed: "Thread",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      delaySeconds: 10,
    });

    expect(store.readScheduledMessages().map((item) => item.id)).toEqual([second.id, first.id]);

    store.markScheduledMessageSending(second.id);
    expect(store.readScheduledMessages()[0]).toEqual(
      expect.objectContaining({
        id: second.id,
        status: "sending",
      }),
    );

    store.markScheduledMessagePending(second.id);
    store.markScheduledMessageFailed(first.id, "No connection");
    expect(store.readScheduledMessages()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: second.id,
          status: "pending",
        }),
        expect.objectContaining({
          id: first.id,
          status: "failed",
          lastError: "No connection",
        }),
      ]),
    );

    store.removeScheduledMessagesForThread({ environmentId, threadId });
    expect(store.readScheduledMessages()).toEqual([]);
  });

  it("detects pending and sending auto-continues for a thread", async () => {
    const storage = createLocalStorageStub();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T11:00:00.000Z"));
    const store = await loadStoreWithStorage(storage);
    const environmentId = EnvironmentId.make("environment-local");
    const threadId = ThreadId.make("thread-1");
    const threadRef = { environmentId, threadId };

    const item = store.scheduleThreadMessage({
      environmentId,
      threadId,
      text: "continue",
      outgoingText: "continue",
      titleSeed: "Thread",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      delaySeconds: 30,
      source: "rate-limit-auto-continue",
    });

    expect(store.hasPendingAutoContinueForThread(threadRef)).toBe(true);

    store.markScheduledMessageSending(item.id);
    expect(store.hasPendingAutoContinueForThread(threadRef)).toBe(true);
  });

  it("ignores failed expired and manual messages for auto-continue dedupe", async () => {
    const storage = createLocalStorageStub();
    storage.setItem(
      "t3code:scheduled-messages:v1",
      JSON.stringify({
        items: [
          {
            id: "failed-auto",
            environmentId: "environment-local",
            threadId: "thread-1",
            text: "failed",
            outgoingText: "failed",
            titleSeed: "Thread",
            modelSelection: {
              instanceId: "codex",
              model: "gpt-5.4",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            createdAt: "2026-07-04T10:00:00.000Z",
            scheduledFor: "2026-07-04T11:30:00.000Z",
            status: "failed",
            source: "rate-limit-auto-continue",
          },
          {
            id: "expired-auto",
            environmentId: "environment-local",
            threadId: "thread-1",
            text: "expired",
            outgoingText: "expired",
            titleSeed: "Thread",
            modelSelection: {
              instanceId: "codex",
              model: "gpt-5.4",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            createdAt: "2026-07-04T10:00:00.000Z",
            scheduledFor: "2026-07-04T10:30:00.000Z",
            status: "expired",
            source: "rate-limit-auto-continue",
          },
          {
            id: "manual-pending",
            environmentId: "environment-local",
            threadId: "thread-1",
            text: "manual",
            outgoingText: "manual",
            titleSeed: "Thread",
            modelSelection: {
              instanceId: "codex",
              model: "gpt-5.4",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            createdAt: "2026-07-04T10:00:00.000Z",
            scheduledFor: "2026-07-04T11:30:00.000Z",
            status: "pending",
          },
        ],
      }),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T11:00:00.000Z"));
    const store = await loadStoreWithStorage(storage);
    const environmentId = EnvironmentId.make("environment-local");
    const threadId = ThreadId.make("thread-1");
    const threadRef = { environmentId, threadId };

    expect(store.hasPendingAutoContinueForThread(threadRef)).toBe(false);
  });
});
