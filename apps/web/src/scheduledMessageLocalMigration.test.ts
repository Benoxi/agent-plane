import {
  EnvironmentId,
  ProviderInstanceId,
  type ScheduledMessageCreateInput,
} from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  LEGACY_SCHEDULED_MESSAGES_STORAGE_KEY,
  migrateLegacyScheduledMessages,
  type LegacyScheduledMessage,
} from "./scheduledMessageLocalMigration";

const environmentId = EnvironmentId.make("environment-local-migration");
const disconnectedEnvironmentId = EnvironmentId.make("environment-disconnected");

const makeLegacyItem = (
  id: string,
  overrides: Partial<LegacyScheduledMessage> = {},
): LegacyScheduledMessage => ({
  id,
  environmentId,
  threadId: "thread-local-migration",
  text: `text ${id}`,
  outgoingText: `outgoing ${id}`,
  titleSeed: `title ${id}`,
  modelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5-codex",
  },
  runtimeMode: "full-access",
  interactionMode: "default",
  scheduledFor: "2026-01-01T00:10:00.000Z",
  status: "pending",
  ...overrides,
});

const readStorageIds = () => {
  const raw = window.localStorage.getItem(LEGACY_SCHEDULED_MESSAGES_STORAGE_KEY);
  if (!raw) return [];
  return (JSON.parse(raw) as { readonly items: ReadonlyArray<LegacyScheduledMessage> }).items.map(
    (item) => item.id,
  );
};

describe("scheduled message localStorage migration", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          clear: () => values.clear(),
          getItem: (key: string) => values.get(key) ?? null,
          removeItem: (key: string) => values.delete(key),
          setItem: (key: string, value: string) => values.set(key, value),
        },
      },
    });
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uploads future pending legacy items with stable clientRequestId", async () => {
    const created: ScheduledMessageCreateInput[] = [];
    window.localStorage.setItem(
      LEGACY_SCHEDULED_MESSAGES_STORAGE_KEY,
      JSON.stringify({
        items: [
          makeLegacyItem("migrate-me"),
          makeLegacyItem("expired", { status: "expired" }),
          makeLegacyItem("overdue", { scheduledFor: "2025-12-31T23:59:00.000Z" }),
        ],
      }),
    );

    await migrateLegacyScheduledMessages({
      connectedEnvironmentIds: new Set([environmentId]),
      now: Date.parse("2026-01-01T00:00:00.000Z"),
      createScheduledMessage: async (request) => {
        created.push(request.input);
        return { _tag: "Success" };
      },
    });

    expect(created).toHaveLength(1);
    expect(created[0]?.clientRequestId).toBe("legacy-local:migrate-me");
    expect(created[0]?.delaySeconds).toBe(600);
    expect(window.localStorage.getItem(LEGACY_SCHEDULED_MESSAGES_STORAGE_KEY)).toBeNull();
  });

  it("keeps failed and disconnected items for retry", async () => {
    window.localStorage.setItem(
      LEGACY_SCHEDULED_MESSAGES_STORAGE_KEY,
      JSON.stringify({
        items: [
          makeLegacyItem("fails"),
          makeLegacyItem("disconnected", { environmentId: disconnectedEnvironmentId }),
        ],
      }),
    );

    await migrateLegacyScheduledMessages({
      connectedEnvironmentIds: new Set([environmentId]),
      now: Date.parse("2026-01-01T00:00:00.000Z"),
      createScheduledMessage: async () => ({ _tag: "Failure" }),
    });

    expect(readStorageIds()).toEqual(["fails", "disconnected"]);
  });
});
