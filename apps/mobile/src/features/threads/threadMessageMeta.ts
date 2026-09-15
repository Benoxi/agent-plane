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

export function shouldShowMessageCopyAction(input: {
  readonly role: OrchestrationMessageRole;
  readonly text: string;
  readonly assistantTurnStillInProgress: boolean;
  readonly streaming: boolean;
}): boolean {
  if (input.role !== "user" && input.role !== "assistant") return false;
  if (input.text.trim().length === 0 || input.streaming) return false;
  return input.role === "user" || !input.assistantTurnStillInProgress;
}
