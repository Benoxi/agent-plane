import {
  type EnvironmentId,
  type ScheduledMessage,
  type ScheduledMessagesStreamEvent,
  type ScopedThreadRef,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export interface ScheduledMessagesProjection {
  readonly items: ReadonlyArray<ScheduledMessage>;
}

function compareScheduledMessages(left: ScheduledMessage, right: ScheduledMessage): number {
  const scheduledDiff = Date.parse(left.scheduledFor) - Date.parse(right.scheduledFor);
  if (scheduledDiff !== 0) return scheduledDiff;
  const createdDiff = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return left.id.localeCompare(right.id);
}

function sortItems(items: ReadonlyArray<ScheduledMessage>): ReadonlyArray<ScheduledMessage> {
  return [...items].sort(compareScheduledMessages);
}

export function applyScheduledMessagesStreamEvent(
  current: Option.Option<ScheduledMessagesProjection>,
  event: ScheduledMessagesStreamEvent,
): Option.Option<ScheduledMessagesProjection> {
  switch (event.type) {
    case "snapshot":
      return Option.some({ items: sortItems(event.items) });
    case "upserted": {
      const items = Option.getOrElse(current, () => ({ items: [] })).items;
      return Option.some({
        items: sortItems([...items.filter((item) => item.id !== event.item.id), event.item]),
      });
    }
    case "removed": {
      const items = Option.getOrElse(current, () => ({ items: [] })).items;
      return Option.some({ items: items.filter((item) => item.id !== event.messageId) });
    }
  }
}

export function projectScheduledMessages(
  current: Option.Option<ScheduledMessagesProjection>,
  event: ScheduledMessagesStreamEvent,
): readonly [
  Option.Option<ScheduledMessagesProjection>,
  ReadonlyArray<ScheduledMessagesProjection>,
] {
  const next = applyScheduledMessagesStreamEvent(current, event);
  return [next, Option.toArray(next)];
}

export function createScheduledMessageEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const scheduledMessagesProjection = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "environment-data:scheduled-messages:projection",
    tag: WS_METHODS.scheduledMessagesSubscribe,
    transform: (stream) =>
      stream.pipe(
        Stream.mapAccum(() => Option.none<ScheduledMessagesProjection>(), projectScheduledMessages),
      ),
  });
  const emptyItemsAtom = Atom.make<ReadonlyArray<ScheduledMessage>>([]).pipe(
    Atom.withLabel("environment-data:scheduled-messages:empty"),
  );
  const scheduledMessagesValueAtom = Atom.family((environmentId: EnvironmentId | null) => {
    if (environmentId === null) {
      return emptyItemsAtom;
    }
    return Atom.make((get): ReadonlyArray<ScheduledMessage> => {
      const projection = Option.getOrNull(
        AsyncResult.value(get(scheduledMessagesProjection({ environmentId, input: {} }))),
      );
      return projection?.items ?? [];
    }).pipe(Atom.withLabel(`environment-data:scheduled-messages:value:${environmentId}`));
  });
  const scheduledMessagesForThreadValueAtom = Atom.family((ref: ScopedThreadRef | null) => {
    if (ref === null) {
      return emptyItemsAtom;
    }
    return Atom.make(
      (get): ReadonlyArray<ScheduledMessage> =>
        get(scheduledMessagesValueAtom(ref.environmentId)).filter(
          (item) => item.threadId === ref.threadId,
        ),
    ).pipe(
      Atom.withLabel(
        `environment-data:scheduled-messages:value:${ref.environmentId}:${ref.threadId}`,
      ),
    );
  });

  return {
    scheduledMessagesProjection,
    scheduledMessagesValueAtom,
    scheduledMessagesForThreadValueAtom,
    createScheduledMessage: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:scheduled-messages:create",
      tag: WS_METHODS.scheduledMessagesCreate,
      concurrency: {
        mode: "parallel",
      },
    }),
    deleteScheduledMessage: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:scheduled-messages:delete",
      tag: WS_METHODS.scheduledMessagesDelete,
      concurrency: {
        mode: "parallel",
      },
    }),
  };
}
