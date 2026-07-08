import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ComposerPrimaryActions } from "./ComposerPrimaryActions";

const baseProps = {
  compact: false,
  pendingAction: null,
  isRunning: false,
  showPlanFollowUpPrompt: false,
  promptHasText: true,
  isSendBusy: false,
  isConnecting: false,
  isEnvironmentUnavailable: false,
  isPreparingWorktree: false,
  hasSendableContent: true,
  scheduleDisabledReason: null,
  onPreviousPendingQuestion: vi.fn(),
  onInterrupt: vi.fn(),
  onImplementPlanInNewThread: vi.fn(),
  onSchedule: vi.fn(),
};

const voiceDictation = {
  disabled: false,
  unsupportedReason: null,
  isListening: false,
  elapsedSeconds: 0,
  onToggle: vi.fn(),
};

describe("ComposerPrimaryActions voice dictation", () => {
  it("renders the mic action in the idle branch", () => {
    const markup = renderToStaticMarkup(
      <ComposerPrimaryActions {...baseProps} voiceDictation={voiceDictation} />,
    );

    expect(markup).toContain('aria-label="Start voice dictation"');
  });

  it("does not render the mic action while answering pending questions", () => {
    const markup = renderToStaticMarkup(
      <ComposerPrimaryActions
        {...baseProps}
        pendingAction={{
          questionIndex: 0,
          isLastQuestion: true,
          canAdvance: true,
          isResponding: false,
          isComplete: true,
        }}
        voiceDictation={voiceDictation}
      />,
    );

    expect(markup).not.toContain("voice dictation");
  });

  it("does not render the mic action while running", () => {
    const markup = renderToStaticMarkup(
      <ComposerPrimaryActions {...baseProps} isRunning voiceDictation={voiceDictation} />,
    );

    expect(markup).not.toContain("voice dictation");
  });

  it("disables the mic action when unsupported", () => {
    const markup = renderToStaticMarkup(
      <ComposerPrimaryActions
        {...baseProps}
        voiceDictation={{
          ...voiceDictation,
          unsupportedReason: "Voice dictation is not supported in this browser.",
        }}
      />,
    );

    expect(markup).toContain('aria-label="Start voice dictation"');
    expect(markup).toContain("disabled");
  });

  it("switches the mic action label while listening", () => {
    const markup = renderToStaticMarkup(
      <ComposerPrimaryActions
        {...baseProps}
        voiceDictation={{ ...voiceDictation, isListening: true, elapsedSeconds: 12 }}
      />,
    );

    expect(markup).toContain('aria-label="Stop voice dictation"');
    expect(markup).toContain("Stop dictation (12s)");
  });
});
