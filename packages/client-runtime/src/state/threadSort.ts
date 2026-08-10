import type { ProjectId } from "@t3tools/contracts";
import type { SidebarProjectSortOrder, SidebarThreadSortOrder } from "@t3tools/contracts/settings";
import * as Arr from "effect/Array";
import * as Order from "effect/Order";

export interface ThreadSortInput {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly latestUserMessageAt?: string | null;
  readonly messages?: ReadonlyArray<{
    readonly createdAt: string;
    readonly role: string;
  }>;
}

export function toSortableTimestamp(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function getFirstSortableTimestamp(...values: Array<string | null | undefined>): number | null {
  for (const value of values) {
    const timestamp = toSortableTimestamp(value ?? undefined);
    if (timestamp !== null) {
      return timestamp;
    }
  }

  return null;
}

export function getThreadSortTimestamp(
  thread: ThreadSortInput,
  sortOrder: SidebarThreadSortOrder | Exclude<SidebarProjectSortOrder, "manual">,
): number {
  if (sortOrder === "created_at") {
    return (
      getFirstSortableTimestamp(thread.createdAt, thread.updatedAt) ?? Number.NEGATIVE_INFINITY
    );
  }

  const projectedUserActivity = toSortableTimestamp(thread.latestUserMessageAt ?? undefined);
  if (projectedUserActivity !== null) {
    return projectedUserActivity;
  }

  let latestLoadedUserActivity: number | null = null;
  for (const message of thread.messages ?? []) {
    if (message.role !== "user") continue;
    const messageTimestamp = toSortableTimestamp(message.createdAt);
    if (messageTimestamp === null) continue;
    latestLoadedUserActivity = Math.max(
      latestLoadedUserActivity ?? Number.NEGATIVE_INFINITY,
      messageTimestamp,
    );
  }

  if (latestLoadedUserActivity !== null) {
    return latestLoadedUserActivity;
  }

  // Threads without user activity remain anchored to their creation time.
  // updatedAt also changes for assistant output, status, and title updates,
  // so using it here would make those non-user events reorder the sidebar.
  return toSortableTimestamp(thread.createdAt) ?? Number.NEGATIVE_INFINITY;
}

export function sortThreads<T extends { readonly id: string } & ThreadSortInput>(
  threads: readonly T[],
  sortOrder: SidebarThreadSortOrder,
): T[] {
  return Arr.sort(
    threads,
    Order.mapInput(
      Order.Struct({
        timestamp: Order.flip(Order.Number),
        createdAt: Order.flip(Order.Number),
        id: Order.flip(Order.String),
      }),
      (thread: T) => ({
        timestamp: getThreadSortTimestamp(thread, sortOrder),
        createdAt:
          getFirstSortableTimestamp(thread.createdAt, thread.updatedAt) ?? Number.NEGATIVE_INFINITY,
        id: thread.id,
      }),
    ),
  );
}

export function getLatestThreadForProject<
  T extends {
    readonly id: string;
    readonly projectId: ProjectId;
    readonly archivedAt: string | null;
  } & ThreadSortInput,
>(threads: readonly T[], projectId: ProjectId, sortOrder: SidebarThreadSortOrder): T | null {
  return (
    sortThreads(
      threads.filter((thread) => thread.projectId === projectId && thread.archivedAt === null),
      sortOrder,
    )[0] ?? null
  );
}
