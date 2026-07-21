import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import {
  RATE_LIMIT_AUTO_CONTINUE_DELAY_SECONDS,
  RATE_LIMIT_AUTO_CONTINUE_SOURCE,
  RATE_LIMIT_AUTO_CONTINUE_TEXT,
  shouldScheduleRateLimitAutoContinue,
} from "../rateLimitAutoContinue";
import { useThread, useThreadActivities, useThreadRefs } from "../state/entities";
import { scheduleThreadMessage, useScheduledMessagesForThread } from "../scheduledMessageStore";

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
  const processedActivityIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!thread) {
      return;
    }

    let hasPendingAutoContinue = scheduledMessages.some(
      (item) =>
        item.source === RATE_LIMIT_AUTO_CONTINUE_SOURCE &&
        (item.status === "pending" || item.status === "sending"),
    );

    for (const activity of activities) {
      if (processedActivityIdsRef.current.has(activity.id)) {
        continue;
      }

      if (!shouldScheduleRateLimitAutoContinue({ activity, hasPendingAutoContinue })) {
        processedActivityIdsRef.current.add(activity.id);
        continue;
      }

      scheduleThreadMessage({
        environmentId: threadRef.environmentId,
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
      });
      hasPendingAutoContinue = true;
      processedActivityIdsRef.current.add(activity.id);
    }
  }, [activities, scheduledMessages, thread, threadRef]);

  return null;
}
