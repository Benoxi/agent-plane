import type { SessionPhase } from "./types";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";

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
