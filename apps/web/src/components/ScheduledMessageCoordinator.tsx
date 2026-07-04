import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEffect, useMemo, useRef, useState } from "react";

import { derivePhase } from "../session-logic";
import {
  markScheduledMessageFailed,
  markScheduledMessagePending,
  markScheduledMessageSending,
  removeScheduledMessage,
  useScheduledMessages,
} from "../scheduledMessageStore";
import { useEnvironments } from "../state/environments";
import { readThreadShell } from "../state/entities";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { createStartedThreadTextTurnInput } from "../threadSendExecution";

export function ScheduledMessageCoordinator() {
  const scheduledMessages = useScheduledMessages();
  const { environments } = useEnvironments();
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const [pulse, setPulse] = useState(0);
  const inFlightMessageIdsRef = useRef(new Set<string>());

  const environmentConnectionById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.connection]),
      ),
    [environments],
  );

  useEffect(() => {
    const pendingItems = scheduledMessages.filter((item) => item.status === "pending");
    if (pendingItems.length === 0) {
      return;
    }

    const now = Date.now();
    const dueItems = pendingItems.filter((item) => Date.parse(item.scheduledFor) <= now);
    const nextDelay =
      dueItems.length > 0
        ? 1000
        : Math.max(
            250,
            Math.min(
              ...pendingItems.map((item) => Math.max(0, Date.parse(item.scheduledFor) - now)),
            ),
          );
    const timeoutId = window.setTimeout(() => {
      setPulse((current) => current + 1);
    }, nextDelay);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [scheduledMessages, pulse]);

  useEffect(() => {
    const busyThreadKeys = new Set<string>();
    const dueItems = scheduledMessages
      .filter((item) => item.status === "pending" && Date.parse(item.scheduledFor) <= Date.now())
      .sort((left, right) => Date.parse(left.scheduledFor) - Date.parse(right.scheduledFor));

    if (dueItems.length === 0) {
      return;
    }

    let cancelled = false;

    void (async () => {
      for (const item of dueItems) {
        if (cancelled || inFlightMessageIdsRef.current.has(item.id)) {
          continue;
        }

        const threadRef = scopeThreadRef(item.environmentId, item.threadId);
        const threadKey = scopedThreadKey(threadRef);
        if (busyThreadKeys.has(threadKey)) {
          continue;
        }

        const connection = environmentConnectionById.get(item.environmentId);
        if (!connection || connection.phase !== "connected") {
          continue;
        }

        const thread = readThreadShell(threadRef);
        if (!thread || derivePhase(thread.session ?? null) !== "ready") {
          continue;
        }

        busyThreadKeys.add(threadKey);
        inFlightMessageIdsRef.current.add(item.id);
        markScheduledMessageSending(item.id);

        const startResult = await startThreadTurn({
          environmentId: item.environmentId,
          input: createStartedThreadTextTurnInput({
            threadId: item.threadId,
            text: item.outgoingText,
            attachments: item.attachments ?? [],
            modelSelection: item.modelSelection,
            titleSeed: item.titleSeed,
            runtimeMode: item.runtimeMode,
            interactionMode: item.interactionMode,
          }).input,
        });

        inFlightMessageIdsRef.current.delete(item.id);

        if (startResult._tag === "Success") {
          removeScheduledMessage(item.id);
          continue;
        }

        if (isAtomCommandInterrupted(startResult)) {
          markScheduledMessagePending(item.id);
          continue;
        }

        const latestConnection = environmentConnectionById.get(item.environmentId);
        const latestThread = readThreadShell(threadRef);
        const latestPhase = latestThread
          ? derivePhase(latestThread.session ?? null)
          : "disconnected";
        if (latestConnection?.phase !== "connected" || latestPhase !== "ready") {
          markScheduledMessagePending(item.id);
          continue;
        }

        const error = squashAtomCommandFailure(startResult);
        markScheduledMessageFailed(
          item.id,
          error instanceof Error ? error.message : "Failed to send scheduled message.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [environmentConnectionById, pulse, scheduledMessages, startThreadTurn]);

  return null;
}
