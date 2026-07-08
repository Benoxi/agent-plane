import type React from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  formatPendingPrimaryActionLabel,
  getComposerPointerFocusProps,
} from "./ComposerPrimaryActions";

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

describe("getComposerPointerFocusProps", () => {
  it("omits focus-preservation handlers when disabled", () => {
    expect(getComposerPointerFocusProps(false, "plain-action")).toBeUndefined();
    expect(getComposerPointerFocusProps(false, "floating-trigger")).toBeUndefined();
  });

  it("preserves focus for plain composer actions", () => {
    const preventDefault = vi.fn();
    const props = getComposerPointerFocusProps(true, "plain-action");

    expect(props).toBeDefined();
    props?.onPointerDown({
      preventDefault,
    } as unknown as React.PointerEvent<HTMLElement>);

    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("does not suppress pointer events for floating layer triggers", () => {
    expect(getComposerPointerFocusProps(true, "floating-trigger")).toBeUndefined();
  });
});
