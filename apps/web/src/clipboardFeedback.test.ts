import { describe, expect, it, vi } from "vite-plus/test";

import { ClipboardFeedbackController, type ClipboardFeedbackEvent } from "./clipboardFeedback";

describe("ClipboardFeedbackController", () => {
  it("reports pending and successful writes without clipboard contents", () => {
    const controller = new ClipboardFeedbackController(() => 1_000);
    const events: ClipboardFeedbackEvent[] = [];
    controller.subscribe((event) => events.push(event));

    const operationId = controller.start("chat message");
    controller.succeed(operationId, "chat message");

    expect(events).toEqual([
      { operationId, target: "chat message", status: "pending", announce: false },
      { operationId, target: "chat message", status: "success", announce: true },
    ]);
    expect(JSON.stringify(events)).not.toContain("secret contents");
  });

  it("suppresses duplicate success announcements inside the quiet window", () => {
    let now = 1_000;
    const controller = new ClipboardFeedbackController(() => now);
    const listener = vi.fn();
    controller.subscribe(listener);

    const first = controller.start("code block");
    controller.succeed(first, "code block");
    now += 250;
    const second = controller.start("code block");
    controller.succeed(second, "code block");

    expect(listener).toHaveBeenLastCalledWith({
      operationId: second,
      target: "code block",
      status: "success",
      announce: false,
    });
  });

  it("does not suppress a different clipboard operation in the same category", () => {
    const controller = new ClipboardFeedbackController(() => 1_000);
    const listener = vi.fn();
    controller.subscribe(listener);

    const first = controller.start("chat message");
    controller.succeed(first, "chat message", true, "message:a");
    const second = controller.start("chat message");
    controller.succeed(second, "chat message", true, "message:b");

    expect(listener).toHaveBeenLastCalledWith({
      operationId: second,
      target: "chat message",
      status: "success",
      announce: true,
    });
  });

  it("announces failures with a sanitized operation error", () => {
    const controller = new ClipboardFeedbackController();
    const listener = vi.fn();
    controller.subscribe(listener);
    const error = new Error("Clipboard permission denied.");

    const operationId = controller.start("conversation");
    controller.fail(operationId, "conversation", error);

    expect(listener).toHaveBeenLastCalledWith({
      operationId,
      target: "conversation",
      status: "failure",
      announce: true,
      error,
    });
  });

  it("does not announce stale operations that finish after a newer copy starts", () => {
    const controller = new ClipboardFeedbackController();
    const listener = vi.fn();
    controller.subscribe(listener);

    const first = controller.start("first");
    const second = controller.start("second");
    controller.succeed(first, "first");
    controller.succeed(second, "second");

    expect(listener).toHaveBeenNthCalledWith(3, {
      operationId: first,
      target: "first",
      status: "success",
      announce: false,
    });
    expect(listener).toHaveBeenLastCalledWith({
      operationId: second,
      target: "second",
      status: "success",
      announce: true,
    });
  });
});
