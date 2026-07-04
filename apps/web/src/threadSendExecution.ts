import type {
  ModelSelection,
  OrchestrationProposedPlanId,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
  UploadChatAttachment,
} from "@t3tools/contracts";

import { newMessageId } from "./lib/utils";

export function createStartedThreadTextTurnInput(input: {
  threadId: ThreadId;
  text: string;
  modelSelection: ModelSelection;
  titleSeed: string;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  attachments?: ReadonlyArray<UploadChatAttachment>;
  createdAt?: string;
  sourceProposedPlan?: {
    threadId: ThreadId;
    planId: OrchestrationProposedPlanId;
  };
}) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const messageId = newMessageId();

  return {
    createdAt,
    messageId,
    input: {
      threadId: input.threadId,
      message: {
        messageId,
        role: "user" as const,
        text: input.text,
        attachments: [...(input.attachments ?? [])],
      },
      modelSelection: input.modelSelection,
      titleSeed: input.titleSeed,
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
      ...(input.sourceProposedPlan
        ? {
            sourceProposedPlan: input.sourceProposedPlan,
          }
        : {}),
      createdAt,
    },
  };
}
