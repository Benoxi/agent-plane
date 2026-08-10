import { TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { shouldShowAssistantMessageMeta } from "./threadMessageMeta";

describe("shouldShowAssistantMessageMeta", () => {
  it("keeps completed imported assistant messages copyable without a turn id", () => {
    expect(
      shouldShowAssistantMessageMeta({
        role: "assistant",
        turnId: null,
        messageIdIsTerminalForTurn: false,
        assistantTurnStillInProgress: false,
        streaming: false,
      }),
    ).toBe(true);
  });

  it("hides metadata for streaming and non-terminal in-turn messages", () => {
    expect(
      shouldShowAssistantMessageMeta({
        role: "assistant",
        turnId: TurnId.make("turn-1"),
        messageIdIsTerminalForTurn: false,
        assistantTurnStillInProgress: false,
        streaming: false,
      }),
    ).toBe(false);
    expect(
      shouldShowAssistantMessageMeta({
        role: "assistant",
        turnId: null,
        messageIdIsTerminalForTurn: false,
        assistantTurnStillInProgress: false,
        streaming: true,
      }),
    ).toBe(false);
  });
});
