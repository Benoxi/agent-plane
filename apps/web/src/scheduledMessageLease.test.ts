import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { __testing, withScheduledMessageDispatchLease } from "./scheduledMessageLease";

afterEach(() => {
  __testing.resetLocalDispatches();
});

describe("withScheduledMessageDispatchLease", () => {
  it("dispatches while an exclusive same-origin lock is available", async () => {
    const dispatch = vi.fn(async () => "sent");
    const request = vi.fn(async (_name, options, callback) => {
      expect(options).toEqual({ ifAvailable: true, mode: "exclusive" });
      return callback({ name: "scheduled-message" });
    });

    await expect(
      withScheduledMessageDispatchLease("message-1", dispatch, {
        request,
      } as unknown as Pick<LockManager, "request">),
    ).resolves.toEqual({ acquired: true, value: "sent" });
    expect(request).toHaveBeenCalledWith(
      "t3code:scheduled-message-dispatch:message-1",
      expect.anything(),
      expect.any(Function),
    );
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("does not dispatch when another tab owns the lock", async () => {
    const dispatch = vi.fn(async () => "sent");
    const request = vi.fn(async (_name, _options, callback) => callback(null));

    await expect(
      withScheduledMessageDispatchLease("message-1", dispatch, {
        request,
      } as unknown as Pick<LockManager, "request">),
    ).resolves.toEqual({ acquired: false });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps an in-tab fallback lease until dispatch settles", async () => {
    let finish!: () => void;
    const firstDispatch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const secondDispatch = vi.fn(async () => undefined);

    const first = withScheduledMessageDispatchLease("message-1", firstDispatch, null);
    await expect(
      withScheduledMessageDispatchLease("message-1", secondDispatch, null),
    ).resolves.toEqual({ acquired: false });
    finish();
    await expect(first).resolves.toEqual({ acquired: true, value: undefined });
    await expect(
      withScheduledMessageDispatchLease("message-1", secondDispatch, null),
    ).resolves.toEqual({ acquired: true, value: undefined });
  });
});
