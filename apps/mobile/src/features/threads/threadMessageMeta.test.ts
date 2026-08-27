import { TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { shouldShowAssistantMessageMeta, shouldShowMessageCopyAction } from "./threadMessageMeta";

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

describe("shouldShowMessageCopyAction", () => {
  it("shows copy for non-empty completed user and assistant messages", () => {
    for (const role of ["user", "assistant"] as const) {
      expect(
        shouldShowMessageCopyAction({
          role,
          text: "Copy me",
          assistantTurnStillInProgress: false,
          streaming: false,
        }),
      ).toBe(true);
    }
  });

  it("keeps empty and active assistant messages hidden", () => {
    expect(
      shouldShowMessageCopyAction({
        role: "assistant",
        text: "   ",
        assistantTurnStillInProgress: false,
        streaming: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMessageCopyAction({
        role: "assistant",
        text: "Partial",
        assistantTurnStillInProgress: true,
        streaming: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMessageCopyAction({
        role: "assistant",
        text: "Partial",
        assistantTurnStillInProgress: false,
        streaming: true,
      }),
    ).toBe(false);
  });
});
