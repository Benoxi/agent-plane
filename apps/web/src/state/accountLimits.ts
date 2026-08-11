/**
 * Multi-environment account-limits state.
 *
 * Every connected environment reports its cached snapshot per provider
 * instance. Overview surfaces retain each target so two accounts are never
 * presented as one, while the composer performs an exact target lookup.
 *
 * @module state/accountLimits
 */
import { useAtomValue } from "@effect/atom-react";
import {
  ACCOUNT_LIMITS_CONTRACT_VERSION,
  type AccountLimitsSnapshot,
  type EnvironmentId,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useMemo } from "react";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentPresentations } from "./presentation";
import { serverEnvironment } from "./server";

export interface EnvironmentLimitsStatus {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly isPending: boolean;
  readonly snapshots: readonly AccountLimitsSnapshot[] | null;
}

const accountLimitsAtom = Atom.make((get): readonly EnvironmentLimitsStatus[] => {
  const presentations = get(environmentPresentations.presentationsAtom);
  const statuses: EnvironmentLimitsStatus[] = [];
  for (const [environmentId, presentation] of presentations) {
    const result = get(serverEnvironment.accountLimits({ environmentId, input: {} }));
    const summary = Option.getOrNull(AsyncResult.value(result));
    statuses.push({
      environmentId,
      environmentLabel:
        presentation.serverConfig?.environment.label ??
        Option.getOrUndefined(presentation.entry.profile)?.label ??
        environmentId,
      isPending: result.waiting,
      snapshots:
        summary === null || summary.contractVersion !== ACCOUNT_LIMITS_CONTRACT_VERSION
          ? null
          : summary.snapshots,
    });
  }
  return statuses;
}).pipe(Atom.withLabel("web-account-limits"));

export interface AccountLimitsView {
  /** Every distinct environment/provider-instance snapshot. */
  readonly targets: readonly AccountLimitsTarget[];
  /** True until at least one environment has answered. */
  readonly isPending: boolean;
  /**
   * True while any environment is still answering. A provider with no
   * snapshot is "loading" while this holds and "no data" once it clears -
   * the first environment to answer must not decide that for the rest.
   */
  readonly isSettling: boolean;
  readonly getSnapshot: (
    environmentId: EnvironmentId,
    providerInstanceId: ProviderInstanceId,
  ) => AccountLimitsSnapshot | undefined;
  readonly refresh: () => void;
}

export interface AccountLimitsTarget {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly snapshot: AccountLimitsSnapshot;
}

function targetKey(environmentId: EnvironmentId, providerInstanceId: ProviderInstanceId): string {
  return `${environmentId}\u0000${providerInstanceId}`;
}

export function buildAccountLimitsIndexes(environments: readonly EnvironmentLimitsStatus[]) {
  const byTarget = new Map<string, AccountLimitsSnapshot>();
  const targets: AccountLimitsTarget[] = [];
  for (const environment of environments) {
    for (const snapshot of environment.snapshots ?? []) {
      byTarget.set(targetKey(environment.environmentId, snapshot.providerInstanceId), snapshot);
      targets.push({
        environmentId: environment.environmentId,
        environmentLabel: environment.environmentLabel,
        snapshot,
      });
    }
  }
  targets.sort(
    (left, right) =>
      left.snapshot.provider.localeCompare(right.snapshot.provider) ||
      left.environmentLabel.localeCompare(right.environmentLabel) ||
      left.snapshot.providerInstanceId.localeCompare(right.snapshot.providerInstanceId),
  );
  return { targets, byTarget } as const;
}

export function useAccountLimits(): AccountLimitsView {
  const environments = useAtomValue(accountLimitsAtom);

  const indexes = useMemo(() => buildAccountLimitsIndexes(environments), [environments]);
  const getSnapshot = useCallback(
    (environmentId: EnvironmentId, providerInstanceId: ProviderInstanceId) =>
      indexes.byTarget.get(targetKey(environmentId, providerInstanceId)),
    [indexes],
  );

  const refresh = useCallback(() => {
    for (const environment of environments) {
      appAtomRegistry.refresh(
        serverEnvironment.accountLimits({ environmentId: environment.environmentId, input: {} }),
      );
    }
  }, [environments]);

  const answered = environments.filter((environment) => environment.snapshots !== null).length;
  const stillReporting = environments.filter(
    (environment) => environment.snapshots === null && environment.isPending,
  ).length;

  return {
    targets: indexes.targets,
    isPending: answered === 0 && stillReporting > 0,
    isSettling: stillReporting > 0,
    getSnapshot,
    refresh,
  };
}
