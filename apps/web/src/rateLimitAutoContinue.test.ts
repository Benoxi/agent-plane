import { EventId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isRateLimitReachedActivity,
  shouldScheduleRateLimitAutoContinue,
} from "./rateLimitAutoContinue";

function makeActivity(overrides: {
  kind?: string;
  summary?: string;
  payload?: unknown;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make("activity-1"),
    createdAt: "2026-07-04T10:00:00.000Z",
    kind: overrides.kind ?? "runtime.warning",
    summary: overrides.summary ?? "Runtime warning",
    tone: "info",
    payload: overrides.payload ?? {},
    turnId: TurnId.make("turn-1"),
  };
}

describe("rateLimitAutoContinue", () => {
  it("matches runtime warning summaries for rate limit reached", () => {
    expect(
      isRateLimitReachedActivity(
        makeActivity({
          summary: "Rate limit reached",
        }),
      ),
    ).toBe(true);
  });

  it("matches runtime warning payload messages for usage rate limits", () => {
    expect(
      isRateLimitReachedActivity(
        makeActivity({
          payload: {
            message: "usage rate limit reached",
          },
        }),
      ),
    ).toBe(true);
  });

  it("does not match reconnect runtime warnings", () => {
    expect(
      isRateLimitReachedActivity(
        makeActivity({
          payload: {
            message: "Reconnecting... 2/5",
          },
        }),
      ),
    ).toBe(false);
  });

  it("does not match generic slow provider runtime warnings", () => {
    expect(
      isRateLimitReachedActivity(
        makeActivity({
          payload: {
            message: "Provider got slow",
          },
        }),
      ),
    ).toBe(false);
  });

  it("does not match non-warning activities with rate-limit text", () => {
    expect(
      isRateLimitReachedActivity(
        makeActivity({
          kind: "tool.finished",
          summary: "Rate limit reached",
        }),
      ),
    ).toBe(false);
  });

  it("allows scheduling for a matching warning without pending auto-continue", () => {
    expect(
      shouldScheduleRateLimitAutoContinue({
        activity: makeActivity({ summary: "Rate limit reached" }),
        hasPendingAutoContinue: false,
      }),
    ).toBe(true);
  });

  it("blocks scheduling for a matching warning with pending auto-continue", () => {
    expect(
      shouldScheduleRateLimitAutoContinue({
        activity: makeActivity({ summary: "Rate limit reached" }),
        hasPendingAutoContinue: true,
      }),
    ).toBe(false);
  });

  it("blocks scheduling for generic runtime warnings", () => {
    expect(
      shouldScheduleRateLimitAutoContinue({
        activity: makeActivity({ summary: "Reconnecting... 2/5" }),
        hasPendingAutoContinue: false,
      }),
    ).toBe(false);
  });
});
