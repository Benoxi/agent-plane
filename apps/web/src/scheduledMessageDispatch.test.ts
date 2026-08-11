import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  canDispatchScheduledMessageToPhase,
  createScheduledMessageTurnInput,
  shouldRetryFailedScheduledDispatch,
} from "./scheduledMessageDispatch";

describe("canDispatchScheduledMessageToPhase", () => {
  it("allows a due message to start an inactive provider session", () => {
    expect(canDispatchScheduledMessageToPhase("disconnected")).toBe(true);
    expect(canDispatchScheduledMessageToPhase("ready")).toBe(true);
  });

  it("waits while a provider session is starting or running", () => {
    expect(canDispatchScheduledMessageToPhase("connecting")).toBe(false);
    expect(canDispatchScheduledMessageToPhase("running")).toBe(false);
  });

  it("fails permanent start errors instead of retrying stopped sessions forever", () => {
    expect(
      shouldRetryFailedScheduledDispatch({
        connectionPhase: "connected",
        sessionPhase: "disconnected",
      }),
    ).toBe(false);
    expect(
      shouldRetryFailedScheduledDispatch({
        connectionPhase: "reconnecting",
        sessionPhase: "disconnected",
      }),
    ).toBe(true);
    expect(
      shouldRetryFailedScheduledDispatch({
        connectionPhase: "connected",
        sessionPhase: "running",
      }),
    ).toBe(true);
  });
});

describe("createScheduledMessageTurnInput", () => {
  it("dispatches the persisted rich attachment snapshot", () => {
    const input = createScheduledMessageTurnInput({
      id: "scheduled-1",
      environmentId: EnvironmentId.make("environment-local"),
      threadId: ThreadId.make("thread-1"),
      text: "look",
      outgoingText: "look\n\n<terminal_context>snapshot</terminal_context>",
      attachments: [
        {
          type: "image",
          name: "screen.png",
          mimeType: "image/png",
          sizeBytes: 3,
          dataUrl: "data:image/png;base64,abc",
        },
      ],
      titleSeed: "look",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: "2026-07-04T12:00:00.000Z",
      scheduledFor: "2026-07-04T12:01:00.000Z",
      status: "pending",
    });

    expect(input).toEqual(
      expect.objectContaining({
        message: expect.objectContaining({
          text: "look\n\n<terminal_context>snapshot</terminal_context>",
          attachments: [expect.objectContaining({ name: "screen.png" })],
        }),
      }),
    );
  });
});
