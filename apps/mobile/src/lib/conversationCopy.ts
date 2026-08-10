import type { ThreadFeedEntry } from "./threadActivity";

function section(title: string, body: string): string | null {
  const normalizedBody = body.trim();
  return normalizedBody ? `## ${title}\n\n${normalizedBody}` : null;
}

function messageBody(entry: Extract<ThreadFeedEntry, { type: "message" }>): string {
  const attachmentLines = (entry.message.attachments ?? []).map(
    (attachment) => `[Image: ${attachment.name}]`,
  );
  return [entry.message.text.trim(), ...attachmentLines].filter(Boolean).join("\n\n");
}

export function mobileConversationHasCopyableContent(
  entries: ReadonlyArray<ThreadFeedEntry>,
): boolean {
  return entries.some((entry) => {
    if (entry.type === "message") {
      return entry.message.text.trim().length > 0 || (entry.message.attachments?.length ?? 0) > 0;
    }
    return (
      entry.type === "activity-group" && entry.activities.some((activity) => activity.toolLike)
    );
  });
}

export function formatMobileConversationForClipboard(input: {
  readonly title: string;
  readonly entries: ReadonlyArray<ThreadFeedEntry>;
}): string {
  const sections: string[] = [];

  for (const entry of input.entries) {
    if (entry.type === "message") {
      const role = entry.message.role === "user" ? "User" : "Assistant";
      const formatted = section(role, messageBody(entry));
      if (formatted) sections.push(formatted);
      continue;
    }

    if (entry.type === "activity-group") {
      for (const activity of entry.activities) {
        if (!activity.toolLike) continue;
        const formatted = section("Tool output", activity.getCopyText());
        if (formatted) sections.push(formatted);
      }
    }
  }

  if (sections.length === 0) return "";
  const title = input.title.trim() || "Conversation";
  return `# ${title}\n\n${sections.join("\n\n")}`;
}
