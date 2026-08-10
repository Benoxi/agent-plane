import { MessageId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { TimelineEntry } from "../session-logic";
import { formatConversationForClipboard } from "./conversationCopy";

const CREATED_AT = "2026-08-07T10:00:00.000Z";

describe("formatConversationForClipboard", () => {
  it("exports messages, Markdown, images, tool output, and plans in stable timeline order", () => {
    const entries: TimelineEntry[] = [
      {
        id: "user-entry",
        kind: "message",
        createdAt: CREATED_AT,
        message: {
          id: MessageId.make("user-message"),
          role: "user",
          text: "Please inspect **this**.",
          turnId: null,
          streaming: false,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          attachments: [
            {
              type: "image",
              id: "image-1",
              name: "screen.png",
              mimeType: "image/png",
              sizeBytes: 10,
            },
          ],
        },
      },
      {
        id: "tool-entry",
        kind: "work",
        createdAt: CREATED_AT,
        entry: {
          id: "tool-1",
          createdAt: CREATED_AT,
          label: "Ran tests",
          detail: "14 tests passed",
          tone: "tool",
        },
      },
      {
        id: "assistant-entry",
        kind: "message",
        createdAt: CREATED_AT,
        message: {
          id: MessageId.make("assistant-message"),
          role: "assistant",
          text: "```ts\nconst ready = true;\n```",
          turnId: null,
          streaming: false,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
      },
      {
        id: "plan-entry",
        kind: "proposed-plan",
        createdAt: CREATED_AT,
        proposedPlan: {
          id: "plan-1" as never,
          turnId: null,
          planMarkdown: "1. Ship it",
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          implementedAt: null,
          implementationThreadId: null,
        },
      },
    ];

    expect(formatConversationForClipboard({ title: "Copy test", entries })).toBe(
      "# Copy test\n\n" +
        "## User\n\nPlease inspect **this**.\n\n[Image: screen.png]\n\n" +
        "## Tool output\n\nRan tests\n\n14 tests passed\n\n" +
        "## Assistant\n\n```ts\nconst ready = true;\n```\n\n" +
        "## Proposed plan\n\n1. Ship it",
    );
  });

  it("omits empty and non-tool activity and hides the action for an empty conversation", () => {
    expect(
      formatConversationForClipboard({
        title: "Empty",
        entries: [
          {
            id: "info-entry",
            kind: "work",
            createdAt: CREATED_AT,
            entry: {
              id: "info-1",
              createdAt: CREATED_AT,
              label: "Connected",
              tone: "info",
            },
          },
        ],
      }),
    ).toBe("");
  });
});
