import { workLogEntryIsToolLike, type TimelineEntry } from "../session-logic";

function section(title: string, body: string): string | null {
  const normalizedBody = body.trim();
  return normalizedBody ? `## ${title}\n\n${normalizedBody}` : null;
}

function messageBody(entry: Extract<TimelineEntry, { kind: "message" }>): string {
  const attachmentLines = (entry.message.attachments ?? []).map(
    (attachment) => `[Image: ${attachment.name}]`,
  );
  return [entry.message.text.trim(), ...attachmentLines].filter(Boolean).join("\n\n");
}

function workBody(entry: Extract<TimelineEntry, { kind: "work" }>): string {
  const details = [entry.entry.detail, entry.entry.command]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [entry.entry.label.trim(), ...details].filter(Boolean).join("\n\n");
}

export function formatConversationForClipboard(input: {
  readonly title: string;
  readonly entries: ReadonlyArray<TimelineEntry>;
}): string {
  const sections: string[] = [];

  for (const entry of input.entries) {
    if (entry.kind === "message") {
      const role = entry.message.role === "user" ? "User" : "Assistant";
      const formatted = section(role, messageBody(entry));
      if (formatted) sections.push(formatted);
      continue;
    }
    if (entry.kind === "work" && workLogEntryIsToolLike(entry.entry)) {
      const formatted = section("Tool output", workBody(entry));
      if (formatted) sections.push(formatted);
      continue;
    }
    if (entry.kind === "proposed-plan") {
      const formatted = section("Proposed plan", entry.proposedPlan.planMarkdown);
      if (formatted) sections.push(formatted);
    }
  }

  if (sections.length === 0) return "";
  const title = input.title.trim() || "Conversation";
  return `# ${title}\n\n${sections.join("\n\n")}`;
}
