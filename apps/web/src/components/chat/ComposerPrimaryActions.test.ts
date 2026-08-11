import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  formatScheduledLocalTime,
  parseScheduleDurationSeconds,
  ComposerPrimaryActions,
  formatPendingPrimaryActionLabel,
  preventScheduledMessageSubmitPropagation,
} from "./ComposerPrimaryActions";

describe("schedule duration compatibility", () => {
  it("accepts explicit hour, minute, and second durations", () => {
    expect(parseScheduleDurationSeconds("1h 30m")).toBe(5_400);
    expect(parseScheduleDurationSeconds("45s")).toBe(45);
    expect(parseScheduleDurationSeconds("0.5h")).toBe(1_800);
  });

  it("rejects ambiguous, past, malformed, and excessive durations", () => {
    expect(parseScheduleDurationSeconds("30")).toBeNull();
    expect(parseScheduleDurationSeconds("0m")).toBeNull();
    expect(parseScheduleDurationSeconds("tomorrow")).toBeNull();
    expect(parseScheduleDurationSeconds("31d")).toBeNull();
    expect(parseScheduleDurationSeconds("1000h")).toBeNull();
  });

  it("formats the resolved local fire time", () => {
    const initial = formatScheduledLocalTime(60, Date.parse("2026-08-11T12:00:00.000Z"));
    const threeMinutesLater = formatScheduledLocalTime(60, Date.parse("2026-08-11T12:03:00.000Z"));
    expect(initial).toContain("2026");
    expect(threeMinutesLater).not.toBe(initial);
  });
});

function renderPendingActions(isRunning: boolean) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      pendingAction: {
        questionIndex: 0,
        isLastQuestion: true,
        canAdvance: true,
        isResponding: false,
        isComplete: true,
      },
      isRunning,
      showPlanFollowUpPrompt: false,
      promptHasText: false,
      isSendBusy: false,
      sendDisabledReason: null,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: false,
      scheduleDisabledReason: null,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
      onSchedule: () => {},
    }),
  );
}

function renderStandaloneStop() {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      pendingAction: null,
      isRunning: true,
      showPlanFollowUpPrompt: false,
      promptHasText: false,
      isSendBusy: false,
      sendDisabledReason: null,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: false,
      scheduleDisabledReason: null,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
      onSchedule: () => {},
    }),
  );
}

describe("preventScheduledMessageSubmitPropagation", () => {
  it("prevents a portalled schedule submit from reaching the composer form", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    preventScheduledMessageSubmitPropagation({ preventDefault, stopPropagation });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });
});

describe("formatPendingPrimaryActionLabel", () => {
  it("returns 'Submitting...' while responding", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: false,
        isResponding: true,
        questionIndex: 0,
      }),
    ).toBe("Submitting...");
  });

  it("returns 'Submitting...' while responding regardless of other flags", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: true,
        isResponding: true,
        questionIndex: 3,
      }),
    ).toBe("Submitting...");
  });

  it("returns 'Submit' in compact mode on the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Submit");
  });

  it("returns 'Next' in compact mode when not the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: false,
        isResponding: false,
        questionIndex: 1,
      }),
    ).toBe("Next");
  });

  it("returns 'Next question' when not the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: false,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Next question");
  });

  it("returns singular 'Submit answer' on the last question when it is the only question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Submit answer");
  });

  it("returns plural 'Submit answers' on the last question when there are multiple questions", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 1,
      }),
    ).toBe("Submit answers");
  });

  it("returns plural 'Submit answers' for higher question indices", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 5,
      }),
    ).toBe("Submit answers");
  });
});

describe("ComposerPrimaryActions", () => {
  it("offers Stop generation while a running turn is waiting for user input", () => {
    expect(renderPendingActions(true)).toContain('aria-label="Stop generation"');
  });

  it("does not offer Stop generation for a pending request without a running turn", () => {
    expect(renderPendingActions(false)).not.toContain('aria-label="Stop generation"');
  });

  it("matches the small pending action size without changing the standalone size", () => {
    expect(renderPendingActions(true)).toContain("size-8 sm:size-7");
    expect(renderStandaloneStop()).toContain("size-8 sm:h-8 sm:w-8");
    expect(renderStandaloneStop()).not.toContain("sm:size-7");
  });
});
