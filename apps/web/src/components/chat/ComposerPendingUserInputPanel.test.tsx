import { ApprovalRequestId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";

const pendingQuestion = {
  requestId: ApprovalRequestId.make("request-1"),
  createdAt: "2026-08-03T00:00:00.000Z",
  questions: [
    {
      id: "scope",
      header: "Scope",
      question: "Which part should be changed?",
      options: [{ label: "Web", description: "Change the web client" }],
      multiSelect: false,
    },
  ],
} as const;

describe("ComposerPendingUserInputPanel", () => {
  it("exposes separate collapse and safe-minimize controls", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingUserInputPanel
        pendingUserInputs={[pendingQuestion]}
        respondingRequestIds={[]}
        answers={{}}
        questionIndex={0}
        onToggleOption={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Collapse pending agent question"');
    expect(markup).toContain('aria-label="Minimize pending agent question to banner"');
    expect(markup).toContain("the agent will keep waiting");
  });
});
