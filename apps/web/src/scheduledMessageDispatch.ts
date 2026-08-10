import type { SessionPhase } from "./types";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import type { ScheduledMessage } from "./scheduledMessageStore";
import { createStartedThreadTextTurnInput } from "./threadSendExecution";

export function createScheduledMessageTurnInput(item: ScheduledMessage) {
  return createStartedThreadTextTurnInput({
    threadId: item.threadId,
    text: item.outgoingText,
    attachments: item.attachments ?? [],
    modelSelection: item.modelSelection,
    titleSeed: item.titleSeed,
    runtimeMode: item.runtimeMode,
    interactionMode: item.interactionMode,
  }).input;
}

/**
 * A stopped or missing provider session is dispatchable: starting a turn is
 * what recreates that session. Only an in-progress session must be retried.
 */
export function canDispatchScheduledMessageToPhase(phase: SessionPhase): boolean {
  return phase === "disconnected" || phase === "ready";
}

export function shouldRetryFailedScheduledDispatch(input: {
  readonly connectionPhase: EnvironmentConnectionPhase | null;
  readonly sessionPhase: SessionPhase;
}): boolean {
  return (
    input.connectionPhase !== "connected" ||
    input.sessionPhase === "connecting" ||
    input.sessionPhase === "running"
  );
}
