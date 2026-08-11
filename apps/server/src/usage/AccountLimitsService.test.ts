import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderInstanceId } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import { AccountLimitsService, layer } from "./AccountLimitsService.ts";

const testLayer = layer.pipe(
  Layer.provide(ServerSettings.layerTest()),
  Layer.provide(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "t3-account-limits-test-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

it.layer(testLayer)("AccountLimitsService", (it) => {
  it.effect("isolates instances and records an explicit unavailable session", () =>
    Effect.gen(function* () {
      const service = yield* AccountLimitsService;
      const personal = ProviderInstanceId.make("claude_personal");
      const work = ProviderInstanceId.make("claude_work");
      yield* service.ingest({
        provider: "claudeAgent",
        providerInstanceId: personal,
        createdAt: "2026-08-11T12:00:00.000Z",
        payload: {
          subscription_type: "max",
          rate_limits: {
            five_hour: { utilization: 20, resets_at: "2026-08-11T14:00:00.000Z" },
          },
        },
      });
      yield* service.ingest({
        provider: "claudeAgent",
        providerInstanceId: work,
        createdAt: "2026-08-11T12:00:30.000Z",
        payload: {
          subscription_type: "team",
          rate_limits: {
            five_hour: { utilization: 40, resets_at: "2026-08-11T14:00:00.000Z" },
          },
        },
      });
      yield* service.ingest({
        provider: "claudeAgent",
        providerInstanceId: personal,
        createdAt: "2026-08-11T12:01:00.000Z",
        payload: { subscription_type: null, rate_limits: null },
      });

      const summary = yield* service.readSummary();
      expect(
        summary.snapshots.find((entry) => entry.providerInstanceId === personal),
      ).toMatchObject({ available: false, plan: null, windows: [] });
      expect(summary.snapshots.find((entry) => entry.providerInstanceId === work)).toMatchObject({
        available: true,
        plan: "team",
        windows: [{ usedPercent: 40 }],
      });
    }),
  );

  it.effect("retains Codex account-wide and model-scoped meters together", () =>
    Effect.gen(function* () {
      const service = yield* AccountLimitsService;
      const instance = ProviderInstanceId.make("codex_work");
      yield* service.ingest({
        provider: "codex",
        providerInstanceId: instance,
        createdAt: "2026-08-11T12:00:00.000Z",
        payload: {
          limit_id: "codex",
          primary: { used_percent: 20, window_minutes: 10080 },
        },
      });
      yield* service.ingest({
        provider: "codex",
        providerInstanceId: instance,
        createdAt: "2026-08-11T12:01:00.000Z",
        payload: {
          limit_id: "codex_bengalfox",
          limit_name: "GPT-5.3-Codex-Spark",
          primary: { used_percent: 95, window_minutes: 10080 },
        },
      });

      const summary = yield* service.readSummary();
      const snapshot = summary.snapshots.find((entry) => entry.providerInstanceId === instance);
      expect(snapshot?.windows).toEqual([
        expect.objectContaining({ id: "seven_day", model: null, usedPercent: 20 }),
        expect.objectContaining({
          id: "codex_bengalfox:seven_day",
          model: "GPT-5.3-Codex-Spark",
          usedPercent: 95,
        }),
      ]);
    }),
  );
});
