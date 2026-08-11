import {
  ProviderDriverKind,
  ProviderInstanceId,
  type AccountLimitsSnapshot,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { remainingCapacityTone, resolveAccountLimitsStatus } from "./accountLimitsPresentation";

const NOW = Date.parse("2026-08-11T12:00:00.000Z");

function snapshot(
  provider: "codex" | "claude",
  windows: ReadonlyArray<{ id: string; usedPercent: number }>,
): AccountLimitsSnapshot {
  return {
    provider,
    providerInstanceId: ProviderInstanceId.make(provider === "claude" ? "claudeAgent" : "codex"),
    available: true,
    plan: "pro",
    asOf: "2026-08-11T11:59:00.000Z",
    source: "live",
    windows: windows.map((window) => ({
      ...window,
      label: window.id,
      resetsAt: "2026-08-11T14:00:00.000Z",
      windowMinutes: 300,
      model: null,
    })),
  };
}

describe("remainingCapacityTone", () => {
  it.each([
    [61, "healthy"],
    [60, "warning"],
    [30, "warning"],
    [29.9, "low"],
    [10.1, "low"],
    [10, "critical"],
    [0, "critical"],
  ] as const)("maps %s%% remaining to %s", (remaining, tone) => {
    expect(remainingCapacityTone(remaining)).toBe(tone);
  });
});

describe("resolveAccountLimitsStatus", () => {
  it("selects the most constrained reported window", () => {
    const result = resolveAccountLimitsStatus({
      driver: ProviderDriverKind.make("codex"),
      snapshot: snapshot("codex", [
        { id: "five_hour", usedPercent: 35 },
        { id: "weekly", usedPercent: 84 },
      ]),
      isSettling: false,
      nowMs: NOW,
      model: "gpt-5.6-sol",
    });

    expect(result).toMatchObject({
      provider: "codex",
      tone: "low",
      remainingPercent: 16,
      constrainedWindow: { id: "weekly" },
    });
  });

  it("keeps missing, loading, stale, and unsupported data non-healthy", () => {
    expect(
      resolveAccountLimitsStatus({
        driver: ProviderDriverKind.make("claudeAgent"),
        snapshot: undefined,
        isSettling: true,
        nowMs: NOW,
        model: "claude-opus-5",
      })?.tone,
    ).toBe("loading");
    expect(
      resolveAccountLimitsStatus({
        driver: ProviderDriverKind.make("claudeAgent"),
        snapshot: undefined,
        isSettling: false,
        nowMs: NOW,
        model: "claude-opus-5",
      })?.tone,
    ).toBe("unavailable");
    expect(
      resolveAccountLimitsStatus({
        driver: ProviderDriverKind.make("claudeAgent"),
        snapshot: {
          ...snapshot("claude", [{ id: "week", usedPercent: 1 }]),
          available: false,
        },
        isSettling: false,
        nowMs: NOW,
        model: "claude-opus-5",
      })?.tone,
    ).toBe("unavailable");
    expect(
      resolveAccountLimitsStatus({
        driver: ProviderDriverKind.make("codex"),
        snapshot: { ...snapshot("codex", [{ id: "week", usedPercent: 1 }]), asOf: "2020-01-01" },
        isSettling: false,
        nowMs: NOW,
        model: "gpt-5.6-sol",
      })?.tone,
    ).toBe("stale");
    expect(
      resolveAccountLimitsStatus({
        driver: ProviderDriverKind.make("opencode"),
        snapshot: undefined,
        isSettling: false,
        nowMs: NOW,
        model: "gpt-5.6-sol",
      }),
    ).toBeNull();
  });

  it("switches to the selected provider snapshot", () => {
    const snapshots = new Map([
      ["codex", snapshot("codex", [{ id: "week", usedPercent: 5 }])],
      ["claude", snapshot("claude", [{ id: "five_hour", usedPercent: 98 }])],
    ] as const);

    expect(
      resolveAccountLimitsStatus({
        driver: ProviderDriverKind.make("codex"),
        snapshot: snapshots.get("codex"),
        isSettling: false,
        nowMs: NOW,
        model: "gpt-5.6-sol",
      })?.tone,
    ).toBe("healthy");
    expect(
      resolveAccountLimitsStatus({
        driver: ProviderDriverKind.make("claudeAgent"),
        snapshot: snapshots.get("claude"),
        isSettling: false,
        nowMs: NOW,
        model: "claude-fable-5",
      })?.tone,
    ).toBe("critical");
  });

  it("includes only model-scoped windows matching the active model", () => {
    const base = snapshot("claude", [{ id: "week", usedPercent: 20 }]);
    const value: AccountLimitsSnapshot = {
      ...base,
      windows: [
        ...base.windows,
        { ...base.windows[0]!, id: "opus", model: "Opus", usedPercent: 98 },
        { ...base.windows[0]!, id: "fable", model: "Fable", usedPercent: 99 },
      ],
    };

    expect(
      resolveAccountLimitsStatus({
        driver: ProviderDriverKind.make("claudeAgent"),
        snapshot: value,
        isSettling: false,
        nowMs: NOW,
        model: "claude-opus-5",
      }),
    ).toMatchObject({ tone: "critical", constrainedWindow: { id: "opus" } });
    expect(
      resolveAccountLimitsStatus({
        driver: ProviderDriverKind.make("claudeAgent"),
        snapshot: value,
        isSettling: false,
        nowMs: NOW,
        model: "claude-sonnet-5",
      }),
    ).toMatchObject({ tone: "healthy", constrainedWindow: { id: "week" } });
  });

  it("matches a Codex side meter by its reported model name", () => {
    const base = snapshot("codex", [{ id: "week", usedPercent: 20 }]);
    const value: AccountLimitsSnapshot = {
      ...base,
      windows: [
        ...base.windows,
        {
          ...base.windows[0]!,
          id: "codex_bengalfox:week",
          model: "GPT-5.3-Codex-Spark",
          usedPercent: 95,
        },
      ],
    };

    expect(
      resolveAccountLimitsStatus({
        driver: ProviderDriverKind.make("codex"),
        snapshot: value,
        isSettling: false,
        nowMs: NOW,
        model: "gpt-5.3-codex-spark",
      }),
    ).toMatchObject({ tone: "critical", constrainedWindow: { id: "codex_bengalfox:week" } });
  });
});
