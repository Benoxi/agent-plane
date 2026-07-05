import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import {
  RATE_LIMIT_AUTO_CONTINUE_DELAY_SECONDS,
  RATE_LIMIT_AUTO_CONTINUE_SOURCE,
  RATE_LIMIT_AUTO_CONTINUE_TEXT,
  shouldScheduleRateLimitAutoContinue,
} from "../rateLimitAutoContinue";
import { useThread, useThreadActivities, useThreadRefs } from "../state/entities";
import {
  useCreateScheduledMessage,
  useScheduledMessagesForThread,
} from "../state/scheduledMessages";

const AUTO_CONTINUE_RETRY_DELAY_MS = 5_000;

export function RateLimitAutoContinueCoordinator() {
  const threadRefs = useThreadRefs();

  return (
    <>
      {threadRefs.map((threadRef) => (
        <RateLimitAutoContinueThreadWatcher
          key={scopedThreadKey(threadRef)}
          threadRef={threadRef}
        />
      ))}
    </>
  );
}

function RateLimitAutoContinueThreadWatcher(props: { threadRef: ScopedThreadRef }) {
  const { threadRef } = props;
  const thread = useThread(threadRef);
  const activities = useThreadActivities(threadRef);
  const scheduledMessages = useScheduledMessagesForThread(threadRef);
  const createScheduledMessage = useCreateScheduledMessage();
  const processedActivityIdsRef = useRef(new Set<string>());
  const inFlightActivityIdsRef = useRef(new Set<string>());
  const retryTimeoutIdRef = useRef<number | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(
    () => () => {
      if (retryTimeoutIdRef.current !== null) {
        window.clearTimeout(retryTimeoutIdRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!thread) {
      return;
    }

    let cancelled = false;
    const scheduleRetry = () => {
      if (retryTimeoutIdRef.current !== null) {
        return;
      }
      retryTimeoutIdRef.current = window.setTimeout(() => {
        retryTimeoutIdRef.current = null;
        setRetryTick((current) => current + 1);
      }, AUTO_CONTINUE_RETRY_DELAY_MS);
    };

    void (async () => {
      for (const activity of activities) {
        if (
          cancelled ||
          processedActivityIdsRef.current.has(activity.id) ||
          inFlightActivityIdsRef.current.has(activity.id)
        ) {
          continue;
        }

        const hasPendingAutoContinue = scheduledMessages.some(
          (item) =>
            item.source === RATE_LIMIT_AUTO_CONTINUE_SOURCE &&
            (item.status === "pending" || item.status === "sending"),
        );
        if (!shouldScheduleRateLimitAutoContinue({ activity, hasPendingAutoContinue })) {
          processedActivityIdsRef.current.add(activity.id);
          continue;
        }

        inFlightActivityIdsRef.current.add(activity.id);
        const result = await createScheduledMessage({
          environmentId: threadRef.environmentId,
          input: {
            threadId: threadRef.threadId,
            text: RATE_LIMIT_AUTO_CONTINUE_TEXT,
            outgoingText: RATE_LIMIT_AUTO_CONTINUE_TEXT,
            titleSeed: RATE_LIMIT_AUTO_CONTINUE_TEXT,
            modelSelection: thread.modelSelection,
            runtimeMode: thread.runtimeMode,
            interactionMode: thread.interactionMode,
            delaySeconds: RATE_LIMIT_AUTO_CONTINUE_DELAY_SECONDS,
            source: RATE_LIMIT_AUTO_CONTINUE_SOURCE,
            sourceActivityId: activity.id,
            clientRequestId: `rate-limit-auto-continue:${threadRef.threadId}:${activity.id}`,
          },
        });
        inFlightActivityIdsRef.current.delete(activity.id);
        if (cancelled) {
          return;
        }

        if (result._tag === "Success") {
          processedActivityIdsRef.current.add(activity.id);
          continue;
        }

        scheduleRetry();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activities, createScheduledMessage, retryTick, scheduledMessages, thread, threadRef]);

  return null;
}
