import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  type ModelSelection,
  ModelSelection as ModelSelectionSchema,
  ProviderInteractionMode,
  RuntimeMode,
  type ScopedThreadRef,
  ThreadId,
  type UploadChatAttachment,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useSyncExternalStore } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";
import { randomUUID } from "./lib/utils";

const SCHEDULED_MESSAGE_STORAGE_KEY = "t3code:scheduled-messages:v1";

export const ScheduledMessageStatus = Schema.Literals(["pending", "sending", "failed", "expired"]);
export type ScheduledMessageStatus = typeof ScheduledMessageStatus.Type;

const ScheduledUploadChatImageAttachment = Schema.Struct({
  type: Schema.Literal("image"),
  name: Schema.String,
  mimeType: Schema.String,
  sizeBytes: Schema.Number,
  dataUrl: Schema.String,
});

const ScheduledUploadChatAttachment = Schema.Union([ScheduledUploadChatImageAttachment]);

export const ScheduledMessageSummary = Schema.Struct({
  imageCount: Schema.optional(Schema.Number),
  terminalContextCount: Schema.optional(Schema.Number),
  elementContextCount: Schema.optional(Schema.Number),
  previewAnnotationCount: Schema.optional(Schema.Number),
  reviewCommentCount: Schema.optional(Schema.Number),
});
export type ScheduledMessageSummary = typeof ScheduledMessageSummary.Type;

export const ScheduledMessage = Schema.Struct({
  id: Schema.String,
  environmentId: EnvironmentId,
  threadId: ThreadId,
  text: Schema.String,
  outgoingText: Schema.String,
  attachments: Schema.optional(Schema.Array(ScheduledUploadChatAttachment)),
  summary: Schema.optional(ScheduledMessageSummary),
  titleSeed: Schema.String,
  modelSelection: ModelSelectionSchema,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  createdAt: Schema.String,
  scheduledFor: Schema.String,
  status: ScheduledMessageStatus,
  lastError: Schema.optional(Schema.String),
});
export type ScheduledMessage = typeof ScheduledMessage.Type;

const ScheduledMessageState = Schema.Struct({
  items: Schema.Array(ScheduledMessage),
});
type ScheduledMessageState = typeof ScheduledMessageState.Type;

interface ScheduleThreadMessageInput {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  text: string;
  outgoingText: string;
  attachments?: ReadonlyArray<UploadChatAttachment>;
  summary?: ScheduledMessageSummary;
  titleSeed: string;
  modelSelection: ModelSelection;
  runtimeMode: ScheduledMessage["runtimeMode"];
  interactionMode: ScheduledMessage["interactionMode"];
  delaySeconds: number;
  now?: string;
}

const EMPTY_STATE: ScheduledMessageState = { items: [] };
const listeners = new Set<() => void>();
let state: ScheduledMessageState = EMPTY_STATE;
let hydrated = false;
let storageListenerBound = false;

function compareBySchedule(left: ScheduledMessage, right: ScheduledMessage): number {
  const scheduledDiff = Date.parse(left.scheduledFor) - Date.parse(right.scheduledFor);
  if (scheduledDiff !== 0) {
    return scheduledDiff;
  }
  const createdDiff = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (createdDiff !== 0) {
    return createdDiff;
  }
  return left.id.localeCompare(right.id);
}

function sortItems(items: ReadonlyArray<ScheduledMessage>): ScheduledMessage[] {
  return [...items].sort(compareBySchedule);
}

export function hydrateScheduledMessageState(
  input: ScheduledMessageState,
  now = new Date(),
): ScheduledMessageState {
  const nowMillis = now.getTime();
  const items = sortItems(
    input.items.map((item) => {
      if (item.status === "sending") {
        return {
          ...item,
          status: "expired" as const,
          lastError: "Sending was interrupted before the app finished dispatching this message.",
        };
      }
      if (item.status === "pending" && Date.parse(item.scheduledFor) <= nowMillis) {
        return {
          ...item,
          status: "expired" as const,
          lastError: undefined,
        };
      }
      return item;
    }),
  );
  return { items };
}

function readPersistedState(): ScheduledMessageState {
  try {
    return getLocalStorageItem(SCHEDULED_MESSAGE_STORAGE_KEY, ScheduledMessageState) ?? EMPTY_STATE;
  } catch (error) {
    console.error("Could not read persisted scheduled messages.", error);
    return EMPTY_STATE;
  }
}

function writePersistedState(nextState: ScheduledMessageState) {
  try {
    setLocalStorageItem(SCHEDULED_MESSAGE_STORAGE_KEY, nextState, ScheduledMessageState);
  } catch (error) {
    console.error("Could not write scheduled messages.", error);
  }
}

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function replaceState(nextState: ScheduledMessageState, options?: { persist?: boolean }) {
  state = nextState;
  if (options?.persist !== false) {
    writePersistedState(nextState);
  }
  notifyListeners();
}

function ensureHydrated() {
  if (hydrated) {
    return;
  }
  hydrated = true;
  state = hydrateScheduledMessageState(readPersistedState());
  writePersistedState(state);
}

function ensureStorageListener() {
  if (storageListenerBound || typeof window === "undefined") {
    return;
  }
  storageListenerBound = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== SCHEDULED_MESSAGE_STORAGE_KEY) {
      return;
    }
    replaceState(hydrateScheduledMessageState(readPersistedState()), { persist: false });
  });
}

function updateState(updater: (current: ScheduledMessageState) => ScheduledMessageState) {
  ensureHydrated();
  const nextState = updater(state);
  if (nextState === state) {
    return;
  }
  replaceState(nextState);
}

export function readScheduledMessages(): ReadonlyArray<ScheduledMessage> {
  ensureHydrated();
  return state.items;
}

export function subscribeScheduledMessages(listener: () => void): () => void {
  ensureHydrated();
  ensureStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useScheduledMessages(): ReadonlyArray<ScheduledMessage> {
  return useSyncExternalStore(
    subscribeScheduledMessages,
    readScheduledMessages,
    readScheduledMessages,
  );
}

export function useScheduledMessagesForThread(
  threadRef: ScopedThreadRef | null,
): ReadonlyArray<ScheduledMessage> {
  const items = useScheduledMessages();
  if (threadRef === null) {
    return [];
  }
  const threadKey = scopedThreadKey(threadRef);
  return items.filter(
    (item) =>
      scopedThreadKey({
        environmentId: item.environmentId,
        threadId: item.threadId,
      }) === threadKey,
  );
}

export function scheduleThreadMessage(input: ScheduleThreadMessageInput): ScheduledMessage {
  const scheduledAt = input.now ? new Date(input.now) : new Date();
  const scheduledFor = new Date(scheduledAt.getTime() + Math.max(1, input.delaySeconds) * 1000);
  const item: ScheduledMessage = {
    id: randomUUID(),
    environmentId: input.environmentId,
    threadId: input.threadId,
    text: input.text,
    outgoingText: input.outgoingText,
    attachments: [...(input.attachments ?? [])],
    summary: input.summary,
    titleSeed: input.titleSeed,
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    createdAt: scheduledAt.toISOString(),
    scheduledFor: scheduledFor.toISOString(),
    status: "pending",
  };
  updateState((current) => ({
    items: sortItems([...current.items, item]),
  }));
  return item;
}

export function removeScheduledMessage(messageId: string) {
  updateState((current) => {
    const nextItems = current.items.filter((item) => item.id !== messageId);
    return nextItems.length === current.items.length ? current : { items: nextItems };
  });
}

export function removeScheduledMessagesForThread(threadRef: ScopedThreadRef) {
  updateState((current) => {
    const nextItems = current.items.filter(
      (item) =>
        item.environmentId !== threadRef.environmentId || item.threadId !== threadRef.threadId,
    );
    return nextItems.length === current.items.length ? current : { items: nextItems };
  });
}

function updateScheduledMessage(
  messageId: string,
  updater: (item: ScheduledMessage) => ScheduledMessage,
) {
  updateState((current) => {
    let changed = false;
    const nextItems = current.items.map((item) => {
      if (item.id !== messageId) {
        return item;
      }
      changed = true;
      return updater(item);
    });
    return changed ? { items: sortItems(nextItems) } : current;
  });
}

export function markScheduledMessageSending(messageId: string) {
  updateScheduledMessage(messageId, (item) => ({
    ...item,
    status: "sending",
    lastError: undefined,
  }));
}

export function markScheduledMessagePending(messageId: string) {
  updateScheduledMessage(messageId, (item) => ({
    ...item,
    status: "pending",
    lastError: undefined,
  }));
}

export function markScheduledMessageFailed(messageId: string, error: string) {
  updateScheduledMessage(messageId, (item) => ({
    ...item,
    status: "failed",
    lastError: error,
  }));
}

export const __testing = {
  resetScheduledMessageStoreForTests() {
    hydrated = false;
    state = EMPTY_STATE;
    listeners.clear();
    storageListenerBound = false;
  },
};
