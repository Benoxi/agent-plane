import type { ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { mostConstrainedWindow, providerUsageTone } from "./ProviderUsageIndicator";

function provider(used: readonly number[]): ServerProvider {
  return {
    instanceId: "codex-work",
    driver: "codex",
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-09-10T10:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits: {
      checkedAt: "2026-09-10T10:00:00.000Z",
      windows: used.map((usedPercent, index) => ({
        id: `window-${index}`,
        kind: "weekly",
        label: `Window ${index}`,
        usedPercent,
      })),
    },
  } as unknown as ServerProvider;
}

describe("provider usage composer presentation", () => {
  it("uses the most constrained window and maps remaining capacity to a tone", () => {
    const value = provider([15, 84, 40]);
    expect(mostConstrainedWindow(value.usageLimits!.windows)?.id).toBe("window-1");
    expect(providerUsageTone(value)).toBe("low");
  });

  it("does not invent availability for providers without authoritative snapshots", () => {
    const value = provider([]);
    expect(providerUsageTone({ ...value, usageLimits: undefined })).toBeNull();
    expect(providerUsageTone(value)).toBe("unavailable");
  });
});
