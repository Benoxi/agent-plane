/**
 * Account rate-limit views: the sidebar hover card and the usage page's
 * "Limits" strip. Both render whatever windows the server reports, so a
 * window a provider adds or brings back (Codex's paused 5-hour) appears
 * without a client change.
 *
 * Every percentage is labelled `used` inline - a bare number cannot say
 * whether it is used or remaining. Snapshot age only renders once the data
 * is actually stale; fresh data needs no caption.
 *
 * @module AccountLimits
 */
import type {
  AccountLimitsSnapshot,
  AccountLimitsWindow,
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { useAccountLimits } from "../../state/accountLimits";
import { formatAgo, formatResetAt, formatResetDateTime } from "@t3tools/shared/limitsFormat";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import {
  remainingCapacityTone,
  resolveAccountLimitsStatus,
  resolveFutureResetAt,
  usageProviderForDriver,
  type AccountLimitsTone,
} from "./accountLimitsPresentation";
import { PROVIDER_COLOR, PROVIDER_LABEL, PROVIDER_MARK } from "./usageProviders";

/** Age past which a snapshot stops being "current" and earns a caption. */
const STALE_AFTER_MS = 15 * 60_000;

/**
 * Reset countdowns and snapshot ages drift as time passes, not as data
 * changes; a coarse tick keeps them honest without re-fetching.
 */
function useNowMs(intervalMs = 30_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return nowMs;
}

function usageTone(usedPercent: number): string | undefined {
  const tone = remainingCapacityTone(Math.max(0, 100 - usedPercent));
  if (tone === "critical") return "text-red-500";
  if (tone === "low") return "text-orange-500";
  if (tone === "warning") return "text-yellow-500";
  return "text-emerald-500";
}

const INDICATOR_TONE_CLASS: Record<AccountLimitsTone, string> = {
  healthy: "bg-emerald-500",
  warning: "bg-yellow-400",
  low: "bg-orange-500",
  critical: "bg-red-500",
  unavailable: "border border-dashed border-muted-foreground bg-transparent",
  loading: "animate-pulse bg-muted-foreground/50",
  stale: "bg-muted-foreground/50",
};

function LimitMeter({ window, color }: { window: AccountLimitsWindow; color: string }) {
  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, window.usedPercent))}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

/** `6h ago`, and only once the snapshot is old enough to matter. */
function SnapshotAge({ snapshot, nowMs }: { snapshot: AccountLimitsSnapshot; nowMs: number }) {
  const ageMs = nowMs - Date.parse(snapshot.asOf);
  if (!Number.isFinite(ageMs) || ageMs < STALE_AFTER_MS) return null;
  return (
    <span className="text-[10px] text-muted-foreground">{formatAgo(snapshot.asOf, nowMs)}</span>
  );
}

function snapshotIsStale(snapshot: AccountLimitsSnapshot, nowMs: number): boolean {
  const asOfMs = Date.parse(snapshot.asOf);
  return !Number.isFinite(asOfMs) || nowMs - asOfMs >= STALE_AFTER_MS;
}

function AccountLimitsDetails(props: {
  readonly provider: "codex" | "claude";
  readonly model: string;
  readonly snapshot: AccountLimitsSnapshot | undefined;
  readonly isSettling: boolean;
  readonly nowMs: number;
  readonly stale: boolean;
}) {
  const Mark = PROVIDER_MARK[props.provider];
  const snapshot = props.snapshot;
  return (
    <div className="flex w-72 flex-col gap-3 p-1">
      <div className="flex items-center gap-2">
        <Mark className="size-4" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {PROVIDER_LABEL[props.provider]} usage
          </p>
          <p className="truncate text-xs text-muted-foreground">{props.model}</p>
        </div>
      </div>
      {props.stale ? (
        <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
          This snapshot is stale. Values are shown for reference only.
        </p>
      ) : null}
      {snapshot === undefined || !snapshot.available || snapshot.windows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {snapshot === undefined && props.isSettling
            ? "Loading usage data…"
            : props.provider === "claude"
              ? "Usage data unavailable from this provider session."
              : "Usage data unavailable. Start or refresh a Codex session to obtain a snapshot."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {snapshot.windows.map((window) => {
            const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent));
            return (
              <div key={window.id} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <span className="font-medium text-foreground">{window.label}</span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    props.stale ? "text-muted-foreground" : usageTone(window.usedPercent),
                  )}
                >
                  {Math.round(remaining)}% remaining · {Math.round(window.usedPercent)}% used
                </span>
                <span className="col-span-2 text-muted-foreground">
                  {formatResetDateTime(window.resetsAt) === null
                    ? "Reset time not reported"
                    : `Resets ${formatResetDateTime(window.resetsAt)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {snapshot !== undefined ? (
        <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          <p>
            {snapshot.plan ? `Plan: ${snapshot.plan} · ` : ""}
            {snapshot.source === "live" ? "Provider-reported" : "Recovered provider snapshot"}
          </p>
          <p>Refreshed {formatAgo(snapshot.asOf, props.nowMs)}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Persistent status beside the active provider/model control. */
export function AccountLimitsIndicator(props: {
  readonly driver: ProviderDriverKind;
  readonly environmentId: EnvironmentId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly model: string;
}) {
  const { getSnapshot, isSettling } = useAccountLimits();
  const nowMs = useNowMs();
  const provider = usageProviderForDriver(props.driver);
  const snapshot =
    provider === null ? undefined : getSnapshot(props.environmentId, props.providerInstanceId);
  const status = resolveAccountLimitsStatus({
    driver: props.driver,
    snapshot,
    isSettling,
    nowMs,
    model: props.model,
  });
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  if (provider === null || status === null) return null;

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  };
  const summary =
    status.remainingPercent === null || status.constrainedWindow === null
      ? status.tone === "loading"
        ? "Usage limits loading"
        : status.tone === "stale"
          ? "Usage data is stale"
          : "Usage data unavailable"
      : `${Math.round(status.remainingPercent)}% remaining in ${status.constrainedWindow.label}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 min-h-7 shrink-0"
            aria-label={`${PROVIDER_LABEL[provider]} ${summary}. View usage limits`}
            data-account-limits-tone={status.tone}
            onFocus={() => setOpen(true)}
            onMouseEnter={() => {
              cancelClose();
              setOpen(true);
            }}
            onMouseLeave={scheduleClose}
          />
        }
      >
        <span
          aria-hidden="true"
          className={cn("size-2.5 rounded-full", INDICATOR_TONE_CLASS[status.tone])}
        />
      </PopoverTrigger>
      <PopoverPopup
        side="top"
        align="start"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <AccountLimitsDetails
          provider={provider}
          model={props.model}
          snapshot={snapshot}
          isSettling={isSettling}
          nowMs={nowMs}
          stale={status.tone === "stale"}
        />
      </PopoverPopup>
    </Popover>
  );
}

/** Selected-model quota context for the deliberately web-only scheduler UI. */
export function AccountLimitsScheduleContext(props: {
  readonly driver: ProviderDriverKind;
  readonly environmentId: EnvironmentId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly model: string;
}) {
  const { getSnapshot, isSettling } = useAccountLimits();
  const provider = usageProviderForDriver(props.driver);
  if (provider === null) return null;

  const nowMs = Date.now();
  const snapshot = getSnapshot(props.environmentId, props.providerInstanceId);
  const status = resolveAccountLimitsStatus({
    driver: props.driver,
    snapshot,
    isSettling,
    nowMs,
    model: props.model,
  });
  const resetAt = resolveFutureResetAt(status?.constrainedWindow?.resetsAt ?? null, nowMs);
  const formattedReset = formatResetDateTime(resetAt);

  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      {status?.tone === "loading"
        ? `${PROVIDER_LABEL[provider]} usage reset loading…`
        : formattedReset === null
          ? `${PROVIDER_LABEL[provider]} usage reset unavailable`
          : `${PROVIDER_LABEL[provider]} ${props.model} resets ${formattedReset}`}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Sidebar hover card
// ---------------------------------------------------------------------------

/** Compact per-provider availability, shown on hovering the Usage button. */
export function AccountLimitsHoverCard() {
  const { targets, isPending, isSettling } = useAccountLimits();
  const nowMs = useNowMs();

  if (isPending && targets.length === 0) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">Loading limits…</p>;
  }

  if (targets.length === 0) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">No limit data yet</p>;
  }

  return (
    <div className="flex w-64 flex-col gap-2.5 p-1.5">
      {targets.map(({ environmentId, environmentLabel, snapshot }) => {
        const provider = snapshot.provider;
        const Mark = PROVIDER_MARK[provider];
        return (
          <div
            key={`${environmentId}:${snapshot.providerInstanceId}`}
            className="flex flex-col gap-1"
          >
            <div className="flex items-baseline gap-1.5">
              <Mark className="size-3 shrink-0 self-center" />
              <span className="text-xs font-medium text-foreground">
                {PROVIDER_LABEL[provider]}
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                {snapshot.providerInstanceId} · {environmentLabel}
              </span>
              <span className="ml-auto">
                {snapshot !== undefined ? <SnapshotAge snapshot={snapshot} nowMs={nowMs} /> : null}
              </span>
            </div>
            {snapshot === undefined || !snapshot.available || snapshot.windows.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {snapshot === undefined && isSettling ? "Loading…" : "No limit data yet"}
              </p>
            ) : (
              snapshot.windows.map((window) => (
                <div key={window.id} className="flex items-center gap-2">
                  <span className="w-9 shrink-0 text-[10px] text-muted-foreground">
                    {window.label}
                  </span>
                  <LimitMeter
                    window={window}
                    color={
                      snapshotIsStale(snapshot, nowMs)
                        ? "var(--muted-foreground)"
                        : PROVIDER_COLOR[provider]
                    }
                  />
                  <span
                    className={cn(
                      "shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-foreground",
                      snapshotIsStale(snapshot, nowMs)
                        ? "text-muted-foreground"
                        : usageTone(window.usedPercent),
                    )}
                  >
                    {Math.round(window.usedPercent)}% used
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-right text-[10px] tabular-nums text-muted-foreground">
                    {formatResetAt(window.resetsAt, nowMs) ?? ""}
                  </span>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage page section
// ---------------------------------------------------------------------------

/** The "Limits" strip above the analytics: one column per provider. */
export function AccountLimitsSection() {
  const { targets, isSettling } = useAccountLimits();
  const nowMs = useNowMs();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-foreground">Limits</h2>
      <div className="grid gap-x-12 gap-y-4 sm:grid-cols-2">
        {targets.map(({ environmentId, environmentLabel, snapshot }) => {
          const provider = snapshot.provider;
          const Mark = PROVIDER_MARK[provider];
          return (
            <div
              key={`${environmentId}:${snapshot.providerInstanceId}`}
              className="flex flex-col gap-1.5"
            >
              <div className="flex items-baseline gap-2">
                <Mark className="size-3.5 shrink-0 self-center" />
                <span className="text-sm font-medium text-foreground">
                  {PROVIDER_LABEL[provider]}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {snapshot.providerInstanceId} · {environmentLabel}
                </span>
                <span className="ml-auto">
                  {snapshot !== undefined ? (
                    <SnapshotAge snapshot={snapshot} nowMs={nowMs} />
                  ) : null}
                </span>
              </div>
              {snapshot === undefined || !snapshot.available || snapshot.windows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {snapshot === undefined && isSettling ? "Loading…" : "No limit data yet"}
                </p>
              ) : (
                snapshot.windows.map((window) => {
                  const resetAt = formatResetAt(window.resetsAt, nowMs);
                  return (
                    <div key={window.id} className="flex items-center gap-3">
                      <span className="w-10 shrink-0 text-xs text-muted-foreground">
                        {window.label}
                      </span>
                      <LimitMeter
                        window={window}
                        color={
                          snapshotIsStale(snapshot, nowMs)
                            ? "var(--muted-foreground)"
                            : PROVIDER_COLOR[provider]
                        }
                      />
                      <span
                        className={cn(
                          "shrink-0 whitespace-nowrap text-right text-xs font-medium tabular-nums text-foreground",
                          snapshotIsStale(snapshot, nowMs)
                            ? "text-muted-foreground"
                            : usageTone(window.usedPercent),
                        )}
                      >
                        {Math.round(window.usedPercent)}% used
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                        {resetAt === null ? "" : `resets ${resetAt}`}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
        {targets.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {isSettling ? "Loading…" : "No limit data yet"}
          </p>
        ) : null}
      </div>
    </section>
  );
}
