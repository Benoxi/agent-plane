import type {
  AccountLimitsSnapshot,
  AccountLimitsWindow,
  ProviderDriverKind,
  UsageProviderKind,
} from "@t3tools/contracts";

export const ACCOUNT_LIMITS_STALE_AFTER_MS = 15 * 60_000;

export type AccountLimitsTone =
  | "healthy"
  | "warning"
  | "low"
  | "critical"
  | "unavailable"
  | "loading"
  | "stale";

export interface AccountLimitsStatus {
  readonly provider: UsageProviderKind;
  readonly tone: AccountLimitsTone;
  readonly constrainedWindow: AccountLimitsWindow | null;
  readonly remainingPercent: number | null;
}

export function usageProviderForDriver(driver: ProviderDriverKind): "codex" | "claude" | null {
  if (driver === "codex") return "codex";
  if (driver === "claudeAgent") return "claude";
  return null;
}

export function remainingCapacityTone(remainingPercent: number): AccountLimitsTone {
  if (remainingPercent > 60) return "healthy";
  if (remainingPercent >= 30) return "warning";
  if (remainingPercent > 10) return "low";
  return "critical";
}

export function resolveAccountLimitsStatus(input: {
  readonly driver: ProviderDriverKind;
  readonly snapshot: AccountLimitsSnapshot | undefined;
  readonly isSettling: boolean;
  readonly nowMs: number;
  readonly model: string;
}): AccountLimitsStatus | null {
  const provider = usageProviderForDriver(input.driver);
  if (provider === null) return null;

  const snapshot = input.snapshot;
  if (snapshot === undefined) {
    return {
      provider,
      tone: input.isSettling ? "loading" : "unavailable",
      constrainedWindow: null,
      remainingPercent: null,
    };
  }

  if (!snapshot.available) {
    return {
      provider,
      tone: "unavailable",
      constrainedWindow: null,
      remainingPercent: null,
    };
  }

  const asOfMs = Date.parse(snapshot.asOf);
  if (!Number.isFinite(asOfMs) || input.nowMs - asOfMs > ACCOUNT_LIMITS_STALE_AFTER_MS) {
    return {
      provider,
      tone: "stale",
      constrainedWindow: null,
      remainingPercent: null,
    };
  }

  const normalizedModel = input.model.toLowerCase().replace(/[^a-z0-9]+/gu, "");
  const applicableWindows = snapshot.windows.filter((window) => {
    if (window.model === null) return true;
    const scope = window.model.toLowerCase().replace(/[^a-z0-9]+/gu, "");
    return scope.length > 0 && (normalizedModel.includes(scope) || scope.includes(normalizedModel));
  });
  const constrainedWindow = applicableWindows.reduce<AccountLimitsWindow | null>(
    (current, window) =>
      current === null || window.usedPercent > current.usedPercent ? window : current,
    null,
  );
  if (constrainedWindow === null) {
    return {
      provider,
      tone: "unavailable",
      constrainedWindow: null,
      remainingPercent: null,
    };
  }

  const remainingPercent = Math.max(0, Math.min(100, 100 - constrainedWindow.usedPercent));
  return {
    provider,
    tone: remainingCapacityTone(remainingPercent),
    constrainedWindow,
    remainingPercent,
  };
}
