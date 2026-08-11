import { MessageId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ThreadFeedEntry } from "./threadActivity";
import {
  formatMobileConversationForClipboard,
  mobileConversationHasCopyableContent,
} from "./conversationCopy";

const CREATED_AT = "2026-08-07T10:00:00.000Z";

describe("formatMobileConversationForClipboard", () => {
  it("exports messages, Markdown, images, and tool output in stable feed order", () => {
    const entries: ThreadFeedEntry[] = [
      {
        type: "message",
        id: "user-entry",
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
        type: "activity-group",
        id: "activity-entry",
        createdAt: CREATED_AT,
        turnId: null,
        activities: [
          {
            id: "info",
            createdAt: CREATED_AT,
            turnId: null,
            summary: "Connected",
            detail: null,
            canExpand: false,
            getFullDetail: () => null,
            getCopyText: () => "Connected",
            icon: "message",
            toolLike: false,
            status: null,
          },
          {
            id: "tool",
            createdAt: CREATED_AT,
            turnId: null,
            summary: "Ran tests",
            detail: "14 tests passed",
            canExpand: false,
            getFullDetail: () => null,
            getCopyText: () => "Ran tests\n14 tests passed",
            icon: "command",
            toolLike: true,
            status: "success",
          },
        ],
      },
      {
        type: "message",
        id: "assistant-entry",
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
    ];

    expect(formatMobileConversationForClipboard({ title: "Copy test", entries })).toBe(
      "# Copy test\n\n" +
        "## User\n\nPlease inspect **this**.\n\n[Image: screen.png]\n\n" +
        "## Tool output\n\nRan tests\n14 tests passed\n\n" +
        "## Assistant\n\n```ts\nconst ready = true;\n```",
    );
  });

  it("returns an empty value when the feed has no copyable content", () => {
    expect(formatMobileConversationForClipboard({ title: "Empty", entries: [] })).toBe("");
  });

  it("checks copy availability without evaluating lazy tool output", () => {
    const entries: ThreadFeedEntry[] = [
      {
        type: "activity-group",
        id: "activity-entry",
        createdAt: CREATED_AT,
        turnId: null,
        activities: [
          {
            id: "lazy-tool",
            createdAt: CREATED_AT,
            turnId: null,
            summary: "Large tool output",
            detail: null,
            canExpand: true,
            getFullDetail: () => {
              throw new Error("full detail should remain lazy");
            },
            getCopyText: () => {
              throw new Error("copy text should remain lazy");
            },
            icon: "command",
            toolLike: true,
            status: "success",
          },
        ],
      },
    ];

    expect(mobileConversationHasCopyableContent(entries)).toBe(true);
  });
});
