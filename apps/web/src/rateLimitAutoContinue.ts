import type { OrchestrationThreadActivity } from "@t3tools/contracts";

export const RATE_LIMIT_AUTO_CONTINUE_TEXT =
  "Continue where you left off usage rate limit returned";

export const RATE_LIMIT_AUTO_CONTINUE_DELAY_SECONDS = 18_300;

export const RATE_LIMIT_AUTO_CONTINUE_SOURCE = "rate-limit-auto-continue";

const RATE_LIMIT_PATTERNS = [
  /\brate[\s-]+limit\s+reached\b/,
  /\busage\s+rate\s+limit\b/,
  /\busage\s+limit\s+reached\b/,
];

function normalizeWarningText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectWarningTexts(activity: OrchestrationThreadActivity): string[] {
  const texts = [activity.summary];
  const payload = activity.payload;
  if (!isRecord(payload)) {
    return texts;
  }

  const message = payload.message;
  if (typeof message === "string") {
    texts.push(message);
  }

  for (const key of ["code", "type", "reason", "status", "warning"] as const) {
    const value = payload[key];
    if (typeof value === "string") {
      texts.push(value);
    }
  }

  return texts;
}

export function isRateLimitReachedActivity(activity: OrchestrationThreadActivity): boolean {
  if (activity.kind !== "runtime.warning") {
    return false;
  }

  return collectWarningTexts(activity).some((text) => {
    const normalized = normalizeWarningText(text);
    return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(normalized));
  });
}

export function shouldScheduleRateLimitAutoContinue(input: {
  activity: OrchestrationThreadActivity;
  hasPendingAutoContinue: boolean;
}): boolean {
  if (!isRateLimitReachedActivity(input.activity)) {
    return false;
  }

  return !input.hasPendingAutoContinue;
}
