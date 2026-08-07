import type { OrchestrationMessageRole, TurnId } from "@t3tools/contracts";

export function shouldShowAssistantMessageMeta(input: {
  readonly role: OrchestrationMessageRole;
  readonly turnId: TurnId | null;
  readonly messageIdIsTerminalForTurn: boolean;
  readonly assistantTurnStillInProgress: boolean;
  readonly streaming: boolean;
}): boolean {
  return (
    input.role === "assistant" &&
    (input.turnId === null || input.messageIdIsTerminalForTurn) &&
    !input.assistantTurnStillInProgress &&
    !input.streaming
  );
}
