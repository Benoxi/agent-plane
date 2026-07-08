import type { ScheduledMessagesStreamEvent } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import type * as Stream from "effect/Stream";
import * as StreamModule from "effect/Stream";

export interface ScheduledMessageBusShape {
  readonly publish: (event: ScheduledMessagesStreamEvent) => Effect.Effect<void>;
  readonly stream: Stream.Stream<ScheduledMessagesStreamEvent>;
  readonly wake: Effect.Effect<void>;
  readonly wakeups: Stream.Stream<void>;
}

export class ScheduledMessageBus extends Context.Service<
  ScheduledMessageBus,
  ScheduledMessageBusShape
>()("t3/scheduledMessages/ScheduledMessageBus") {}

const make = Effect.gen(function* () {
  const events = yield* PubSub.unbounded<ScheduledMessagesStreamEvent>();
  const wakeups = yield* PubSub.sliding<void>(1);
  return ScheduledMessageBus.of({
    publish: (event) => PubSub.publish(events, event).pipe(Effect.asVoid),
    get stream() {
      return StreamModule.fromPubSub(events);
    },
    wake: PubSub.publish(wakeups, undefined).pipe(Effect.asVoid),
    get wakeups() {
      return StreamModule.fromPubSub(wakeups);
    },
  });
});

export const layer = Layer.effect(ScheduledMessageBus, make);
