import { describe, expect, it } from "vite-plus/test";

import { canDispatchScheduledMessageToPhase } from "./scheduledMessageDispatch";

describe("canDispatchScheduledMessageToPhase", () => {
  it("allows a due message to start an inactive provider session", () => {
    expect(canDispatchScheduledMessageToPhase("disconnected")).toBe(true);
    expect(canDispatchScheduledMessageToPhase("ready")).toBe(true);
  });

  it("waits while a provider session is starting or running", () => {
    expect(canDispatchScheduledMessageToPhase("connecting")).toBe(false);
    expect(canDispatchScheduledMessageToPhase("running")).toBe(false);
  });
});
