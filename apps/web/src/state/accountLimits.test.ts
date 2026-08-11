import { EnvironmentId, ProviderInstanceId, type AccountLimitsSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildAccountLimitsIndexes, type EnvironmentLimitsStatus } from "./accountLimits";

function snapshot(instance: string, usedPercent: number): AccountLimitsSnapshot {
  return {
    provider: "codex",
    providerInstanceId: ProviderInstanceId.make(instance),
    available: true,
    plan: "plus",
    asOf: `2026-08-11T12:00:${String(usedPercent).padStart(2, "0")}.000Z`,
    source: "live",
    windows: [
      {
        id: "seven_day",
        label: "Week",
        usedPercent,
        resetsAt: null,
        windowMinutes: 10_080,
        model: null,
      },
    ],
  };
}

describe("buildAccountLimitsIndexes", () => {
  it("moves from empty to ingested data without mixing environments or instances", () => {
    const local = EnvironmentId.make("local");
    const remote = EnvironmentId.make("remote");
    const personal = ProviderInstanceId.make("codex_personal");
    const work = ProviderInstanceId.make("codex_work");
    const empty: EnvironmentLimitsStatus[] = [
      { environmentId: local, environmentLabel: "This device", isPending: true, snapshots: null },
    ];
    expect(buildAccountLimitsIndexes(empty).byTarget.size).toBe(0);

    const indexes = buildAccountLimitsIndexes([
      {
        environmentId: local,
        environmentLabel: "This device",
        isPending: false,
        snapshots: [snapshot("codex_personal", 10)],
      },
      {
        environmentId: remote,
        environmentLabel: "Workstation",
        isPending: false,
        snapshots: [snapshot("codex_work", 90)],
      },
    ]);
    expect(indexes.byTarget.get(`${local}\u0000${personal}`)?.windows[0]?.usedPercent).toBe(10);
    expect(indexes.byTarget.get(`${remote}\u0000${work}`)?.windows[0]?.usedPercent).toBe(90);
    expect(indexes.byTarget.get(`${local}\u0000${work}`)).toBeUndefined();
    expect(
      indexes.targets.map(({ environmentLabel, snapshot }) => [
        environmentLabel,
        snapshot.providerInstanceId,
      ]),
    ).toEqual([
      ["This device", personal],
      ["Workstation", work],
    ]);
  });
});
