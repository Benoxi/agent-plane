import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ComposerVoiceDictationButton } from "./ComposerVoiceDictationButton";

const baseProps = {
  disabled: false,
  unsupportedReason: null,
  isListening: false,
  elapsedSeconds: 0,
  onToggle: vi.fn(),
};

describe("ComposerVoiceDictationButton", () => {
  it("renders a start action", () => {
    const markup = renderToStaticMarkup(<ComposerVoiceDictationButton {...baseProps} />);

    expect(markup).toContain('aria-label="Start voice dictation"');
    expect(markup).toContain("Dictate message");
  });

  it("renders a stop action while listening", () => {
    const markup = renderToStaticMarkup(
      <ComposerVoiceDictationButton {...baseProps} isListening elapsedSeconds={12} />,
    );

    expect(markup).toContain('aria-label="Stop voice dictation"');
    expect(markup).toContain("Stop dictation (12s)");
  });

  it("disables unsupported browsers with an explanatory tooltip", () => {
    const markup = renderToStaticMarkup(
      <ComposerVoiceDictationButton
        {...baseProps}
        unsupportedReason="Voice dictation requires HTTPS."
      />,
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain("Voice dictation requires HTTPS.");
  });
});
