import type { ServerProvider, ServerProviderUsageWindow } from "@t3tools/contracts";
import { limitsNotice, remainingPercent } from "@t3tools/shared/usageLimits";
import { useEffect, useState } from "react";

import { usePrimarySettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { LimitWindows } from "./UsageLimits";

export type ProviderUsageTone = "healthy" | "warning" | "low" | "critical" | "unavailable";

export function providerUsageTone(provider: ServerProvider): ProviderUsageTone | null {
  const limits = provider.usageLimits;
  if (!limits) return null;
  if (limitsNotice(limits)) return "unavailable";
  const constrained = mostConstrainedWindow(limits.windows);
  if (!constrained) return "unavailable";
  const remaining = remainingPercent(constrained);
  if (remaining > 60) return "healthy";
  if (remaining >= 30) return "warning";
  if (remaining > 10) return "low";
  return "critical";
}

export function mostConstrainedWindow(
  windows: ReadonlyArray<ServerProviderUsageWindow>,
): ServerProviderUsageWindow | null {
  return windows.reduce<ServerProviderUsageWindow | null>(
    (current, window) =>
      current === null || window.usedPercent > current.usedPercent ? window : current,
    null,
  );
}

const TONE_CLASS: Record<ProviderUsageTone, string> = {
  healthy: "bg-emerald-500",
  warning: "bg-yellow-400",
  low: "bg-orange-500",
  critical: "bg-red-500",
  unavailable: "border border-dashed border-muted-foreground bg-transparent",
};

/** Compact status for the exact environment-local provider instance selected by the composer. */
export function ProviderUsageIndicator({
  provider,
  model,
  scopeKey,
}: {
  readonly provider: ServerProvider;
  readonly model: string;
  readonly scopeKey: string;
}) {
  const tone = providerUsageTone(provider);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [provider.instanceId, model, scopeKey]);
  if (tone === null) return null;

  const limits = provider.usageLimits;
  if (!limits) return null;
  const notice = limitsNotice(limits);
  const constrained = mostConstrainedWindow(limits.windows);
  const summary = constrained
    ? `${remainingPercent(constrained)}% remaining in ${constrained.label}`
    : (notice ?? "Usage limits unavailable");
  const label = provider.displayName?.trim() || String(provider.driver);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 min-h-7 shrink-0"
            aria-label={`${label}: ${summary}. View usage limits`}
            data-provider-usage-tone={tone}
          />
        }
      >
        <span aria-hidden className={cn("size-2.5 rounded-full", TONE_CLASS[tone])} />
      </PopoverTrigger>
      <PopoverPopup side="top" align="start">
        <div className="flex w-80 flex-col gap-2 p-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{label} usage</p>
            <p className="truncate text-xs text-muted-foreground">
              {provider.instanceId} · {model}
            </p>
          </div>
          {notice ? (
            <p className="text-xs text-muted-foreground">{notice}</p>
          ) : (
            <LimitWindows
              compact
              driver={provider.driver}
              windows={limits.windows}
              now={Date.now()}
            />
          )}
          <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
            Account-wide provider snapshot · checked {new Date(limits.checkedAt).toLocaleString()}
          </p>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/** Account-wide reset context for the exact provider instance selected by this composer. */
export function ProviderUsageScheduleContext({ provider }: { readonly provider: ServerProvider }) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const constrained = mostConstrainedWindow(provider.usageLimits?.windows ?? []);
  const reset = constrained?.resetsAt
    ? formatUpcomingTimestamp(constrained.resetsAt, timestampFormat, Date.now())
    : null;
  const label = provider.displayName?.trim() || String(provider.driver);
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      {reset
        ? `${label} account quota resets ${reset}`
        : `${label} account quota reset unavailable`}
    </p>
  );
}
