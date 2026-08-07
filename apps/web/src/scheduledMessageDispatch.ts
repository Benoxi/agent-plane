import type { SessionPhase } from "./types";

/**
 * A stopped or missing provider session is dispatchable: starting a turn is
 * what recreates that session. Only an in-progress session must be retried.
 */
export function canDispatchScheduledMessageToPhase(phase: SessionPhase): boolean {
  return phase === "disconnected" || phase === "ready";
}
