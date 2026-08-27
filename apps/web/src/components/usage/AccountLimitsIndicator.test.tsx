import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { EnvironmentId, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";

const popoverHarness = vi.hoisted(() => ({
  dismiss: null as null | (() => void),
}));

vi.mock("../../state/accountLimits", () => ({
  useAccountLimits: () => ({
    getSnapshot: () => undefined,
    isSettling: false,
  }),
}));

vi.mock("../ui/popover", async () => {
  const ReactModule = await import("react");
  const PopoverContext = ReactModule.createContext<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
  } | null>(null);

  return {
    Popover: (props: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) => {
      popoverHarness.dismiss = () => props.onOpenChange(false);
      return (
        <PopoverContext.Provider value={props}>
          <div data-testid="popover-root" data-open={props.open}>
            {props.children}
          </div>
        </PopoverContext.Provider>
      );
    },
    PopoverTrigger: (props: {
      render: React.ReactElement<Record<string, unknown>>;
      children: React.ReactNode;
    }) => {
      const context = ReactModule.useContext(PopoverContext);
      if (context === null) throw new Error("Missing popover context");
      return ReactModule.cloneElement(props.render, {
        onClick: () => context.onOpenChange(!context.open),
        onKeyDown: (event: { key: string }) => {
          if (event.key === "Enter" || event.key === " ") {
            context.onOpenChange(!context.open);
          }
        },
        children: props.children,
      });
    },
    PopoverPopup: (props: { children: React.ReactNode }) => {
      const context = ReactModule.useContext(PopoverContext);
      return context?.open ? <div data-testid="popover-popup">{props.children}</div> : null;
    },
  };
});

import { AccountLimitsIndicator } from "./AccountLimits";

const baseProps = {
  driver: "codex" as ProviderDriverKind,
  environmentId: "environment-1" as EnvironmentId,
  providerInstanceId: "provider-1" as ProviderInstanceId,
  model: "gpt-5.6",
  scopeKey: "thread:thread-1",
};

function trigger(renderer: ReactTestRenderer): ReactTestInstance {
  return renderer.root.findByProps({
    "data-account-limits-tone": "unavailable",
  });
}

function isOpen(renderer: ReactTestRenderer): boolean {
  return renderer.root.findByProps({ "data-testid": "popover-root" }).props["data-open"];
}

describe("AccountLimitsIndicator interactions", () => {
  beforeAll(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      setInterval: () => 1,
      clearInterval: () => undefined,
    });
  });

  beforeEach(() => {
    popoverHarness.dismiss = null;
  });

  it("opens only through activation and toggles closed", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AccountLimitsIndicator {...baseProps} />);
    });

    expect(isOpen(renderer)).toBe(false);
    expect(trigger(renderer).props.onMouseEnter).toBeUndefined();
    expect(trigger(renderer).props.onFocus).toBeUndefined();

    await act(async () => trigger(renderer).props.onClick());
    expect(isOpen(renderer)).toBe(true);

    await act(async () => trigger(renderer).props.onClick());
    expect(isOpen(renderer)).toBe(false);

    await act(async () => trigger(renderer).props.onKeyDown({ key: "Enter" }));
    expect(isOpen(renderer)).toBe(true);
    await act(async () => trigger(renderer).props.onKeyDown({ key: " " }));
    expect(isOpen(renderer)).toBe(false);
  });

  it("keeps inside interaction open and accepts outside or Escape dismissal", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AccountLimitsIndicator {...baseProps} />);
    });
    await act(async () => trigger(renderer).props.onClick());

    const popup = renderer.root.findByProps({ "data-testid": "popover-popup" });
    await act(async () => popup.props.onClick?.());
    expect(isOpen(renderer)).toBe(true);

    await act(async () => popoverHarness.dismiss?.());
    expect(isOpen(renderer)).toBe(false);

    await act(async () => trigger(renderer).props.onClick());
    expect(isOpen(renderer)).toBe(true);
    await act(async () => popoverHarness.dismiss?.());
    expect(isOpen(renderer)).toBe(false);
    expect(trigger(renderer).props.onFocus).toBeUndefined();
  });

  it("dismisses when thread or provider selection changes", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AccountLimitsIndicator {...baseProps} />);
    });
    await act(async () => trigger(renderer).props.onClick());
    expect(isOpen(renderer)).toBe(true);

    await act(async () => {
      renderer.update(<AccountLimitsIndicator {...baseProps} scopeKey="thread:thread-2" />);
    });
    expect(isOpen(renderer)).toBe(false);

    await act(async () => trigger(renderer).props.onClick());
    await act(async () => {
      renderer.update(<AccountLimitsIndicator {...baseProps} model="gpt-5.7" />);
    });
    expect(isOpen(renderer)).toBe(false);
  });
});
