import { describe, expect, it } from "vite-plus/test";

import {
  canDispatchScheduledMessageToPhase,
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
