import { useAtomValue } from "@effect/atom-react";
import { createScheduledMessageEnvironmentAtoms } from "@t3tools/client-runtime/state/scheduled-messages";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "./use-atom-command";

export const scheduledMessageEnvironment =
  createScheduledMessageEnvironmentAtoms(connectionAtomRuntime);

export function useScheduledMessages(environmentId: EnvironmentId | null) {
  return useAtomValue(scheduledMessageEnvironment.scheduledMessagesValueAtom(environmentId));
}

export function useScheduledMessagesForThread(threadRef: ScopedThreadRef | null) {
  return useAtomValue(scheduledMessageEnvironment.scheduledMessagesForThreadValueAtom(threadRef));
}

export function useCreateScheduledMessage() {
  return useAtomCommand(scheduledMessageEnvironment.createScheduledMessage);
}

export function useDeleteScheduledMessage() {
  return useAtomCommand(scheduledMessageEnvironment.deleteScheduledMessage);
}
