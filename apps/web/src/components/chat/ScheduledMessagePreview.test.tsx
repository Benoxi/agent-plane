import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";

import { ScheduledMessagePreview } from "./ScheduledMessagePreview";

const baseProps = {
  scheduledFor: "2026-09-15T12:30:00.000Z",
  sending: false,
  onCancel: vi.fn(),
};

describe("ScheduledMessagePreview", () => {
  it.each([
    ["long prose", "A long scheduled sentence. ".repeat(30)],
    ["multiline content", Array.from({ length: 20 }, (_, index) => `line ${index}`).join("\n")],
    ["an unbroken value", "https://example.test/" + "segment".repeat(100)],
  ])("keeps %s clamped until the user deliberately expands it", async (_name, text) => {
    let renderer: ReactTestRenderer;
    await act(() => {
      renderer = create(<ScheduledMessagePreview {...baseProps} text={text} />);
    });

    const toggle = renderer!.root.findByProps({ "aria-expanded": false });

    expect(toggle.children).toEqual(["Show full message"]);

    await act(() => toggle.props.onClick());

    expect(renderer!.root.findByProps({ "aria-expanded": true }).children).toEqual(["Show less"]);
  });

  it("keeps cancellation available beside the bounded preview", async () => {
    const onCancel = vi.fn();
    let renderer: ReactTestRenderer;
    await act(() => {
      renderer = create(
        <ScheduledMessagePreview {...baseProps} text={"x".repeat(2_000)} onCancel={onCancel} />,
      );
    });

    const cancel = renderer!.root.findByProps({ "aria-label": "Cancel scheduled message" });

    await act(() => cancel.props.onClick());
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables cancellation while the message is sending", async () => {
    let renderer: ReactTestRenderer;
    await act(() => {
      renderer = create(<ScheduledMessagePreview {...baseProps} text="Sending" sending />);
    });

    expect(
      renderer!.root.findByProps({ "aria-label": "Cancel scheduled message" }).props.disabled,
    ).toBe(true);
  });
});
