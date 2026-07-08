import { ThreadId, type EnvironmentId, type ScheduledMessageCreateInput } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { useEnvironments } from "./state/environments";
import { useCreateScheduledMessage } from "./state/scheduledMessages";

export const LEGACY_SCHEDULED_MESSAGES_STORAGE_KEY = "t3code:scheduled-messages:v1";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface LegacyScheduledMessage {
  readonly id: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: string;
  readonly text: string;
  readonly outgoingText: string;
  readonly titleSeed: string;
  readonly modelSelection: unknown;
  readonly runtimeMode: "approval-required" | "auto-accept-edits" | "full-access";
  readonly interactionMode: "default" | "plan";
  readonly scheduledFor: string;
  readonly status: "pending" | "sending" | "failed" | "expired";
  readonly source?: "manual" | "rate-limit-auto-continue";
  readonly sourceActivityId?: string;
}

export function readLegacyScheduledMessageItems(): ReadonlyArray<LegacyScheduledMessage> {
  const raw = window.localStorage.getItem(LEGACY_SCHEDULED_MESSAGES_STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { readonly items?: ReadonlyArray<LegacyScheduledMessage> };
  return Array.isArray(parsed.items) ? parsed.items : [];
}

export function writeLegacyScheduledMessageItems(items: ReadonlyArray<LegacyScheduledMessage>) {
  if (items.length === 0) {
    window.localStorage.removeItem(LEGACY_SCHEDULED_MESSAGES_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(LEGACY_SCHEDULED_MESSAGES_STORAGE_KEY, JSON.stringify({ items }));
}

export async function migrateLegacyScheduledMessages(input: {
  readonly connectedEnvironmentIds: ReadonlySet<EnvironmentId>;
  readonly now: number;
  readonly createScheduledMessage: (request: {
    readonly environmentId: EnvironmentId;
    readonly input: ScheduledMessageCreateInput;
  }) => Promise<{ readonly _tag: "Success" | "Failure" }>;
}) {
  const items = readLegacyScheduledMessageItems();
  const remaining: LegacyScheduledMessage[] = [];
  for (const item of items) {
    if (!input.connectedEnvironmentIds.has(item.environmentId)) {
      remaining.push(item);
      continue;
    }
    const scheduledForMillis = Date.parse(item.scheduledFor);
    const stale =
      Number.isFinite(scheduledForMillis) && scheduledForMillis < input.now - RETENTION_MS;
    const dueOrInactive =
      item.status !== "pending" ||
      !Number.isFinite(scheduledForMillis) ||
      scheduledForMillis <= input.now;
    if (stale || dueOrInactive) {
      continue;
    }
    const delaySeconds = Math.max(1, Math.ceil((scheduledForMillis - input.now) / 1000));
    const result = await input.createScheduledMessage({
      environmentId: item.environmentId,
      input: {
        threadId: ThreadId.make(item.threadId),
        text: item.text,
        outgoingText: item.outgoingText,
        titleSeed: item.titleSeed,
        modelSelection: item.modelSelection as never,
        runtimeMode: item.runtimeMode,
        interactionMode: item.interactionMode,
        delaySeconds,
        ...(item.source === undefined ? {} : { source: item.source }),
        ...(item.sourceActivityId === undefined ? {} : { sourceActivityId: item.sourceActivityId }),
        clientRequestId: `legacy-local:${item.id}`,
      },
    });
    if (result._tag === "Failure") {
      remaining.push(item);
    }
  }
  writeLegacyScheduledMessageItems(remaining);
}

export function ScheduledMessageLocalMigration() {
  const { environments } = useEnvironments();
  const createScheduledMessage = useCreateScheduledMessage();
  const runningRef = useRef(false);

  useEffect(() => {
    if (runningRef.current || typeof window === "undefined") return;
    const connectedEnvironmentIds = new Set(
      environments
        .filter((environment) => environment.connection.phase === "connected")
        .map((environment) => environment.environmentId),
    );
    if (connectedEnvironmentIds.size === 0) return;

    runningRef.current = true;
    void (async () => {
      try {
        await migrateLegacyScheduledMessages({
          connectedEnvironmentIds,
          now: Date.now(),
          createScheduledMessage,
        });
      } catch {
        // Keep localStorage intact on malformed or unexpected migration failures.
      } finally {
        runningRef.current = false;
      }
    })();
  }, [createScheduledMessage, environments]);

  return null;
}
