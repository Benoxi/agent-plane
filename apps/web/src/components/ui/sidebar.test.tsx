import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarTrigger,
} from "./sidebar";
import {
  MOBILE_SIDEBAR_SWIPE_MIN_DISTANCE,
  resolveMobileSidebarHistoryClose,
  resolveSidebarState,
  shouldDismissMobileSidebarFromSwipe,
} from "./sidebarState";

function renderSidebarButton(className?: string) {
  return renderToStaticMarkup(
    <SidebarProvider>
      <SidebarMenuButton className={className}>Projects</SidebarMenuButton>
    </SidebarProvider>,
  );
}

describe("sidebar interactive cursors", () => {
  it("uses mobile sheet visibility for the shared responsive state", () => {
    expect(resolveSidebarState({ isMobile: true, open: true, openMobile: false })).toBe(
      "collapsed",
    );
    expect(resolveSidebarState({ isMobile: true, open: false, openMobile: true })).toBe("expanded");
    expect(resolveSidebarState({ isMobile: false, open: true, openMobile: false })).toBe(
      "expanded",
    );
  });

  it("dismisses only a deliberate horizontal swipe toward the closed edge", () => {
    expect(MOBILE_SIDEBAR_SWIPE_MIN_DISTANCE).toBe(72);
    expect(
      shouldDismissMobileSidebarFromSwipe({
        side: "left",
        startX: 260,
        startY: 100,
        endX: 160,
        endY: 118,
      }),
    ).toBe(true);
    expect(
      shouldDismissMobileSidebarFromSwipe({
        side: "left",
        startX: 260,
        startY: 100,
        endX: 210,
        endY: 104,
      }),
    ).toBe(false);
    expect(
      shouldDismissMobileSidebarFromSwipe({
        side: "left",
        startX: 260,
        startY: 100,
        endX: 180,
        endY: 180,
      }),
    ).toBe(false);
    expect(
      shouldDismissMobileSidebarFromSwipe({
        side: "left",
        startX: 160,
        startY: 100,
        endX: 260,
        endY: 100,
      }),
    ).toBe(false);
  });

  it("mirrors the dismiss direction for a right-side mobile sidebar", () => {
    expect(
      shouldDismissMobileSidebarFromSwipe({
        side: "right",
        startX: 120,
        startY: 100,
        endX: 220,
        endY: 110,
      }),
    ).toBe(true);
  });

  it("does not retain a stale open marker after route navigation closes the sidebar", () => {
    expect(
      resolveMobileSidebarHistoryClose({
        hasTrackedEntry: true,
        currentEntryIsSidebarSentinel: false,
      }),
    ).toBe("clear");
    expect(
      resolveMobileSidebarHistoryClose({
        hasTrackedEntry: true,
        currentEntryIsSidebarSentinel: true,
      }),
    ).toBe("back");
    expect(
      resolveMobileSidebarHistoryClose({
        hasTrackedEntry: true,
        currentEntryIsSidebarSentinel: true,
        closePending: true,
      }),
    ).toBe("wait");
  });

  it("exposes collapsed state for shared titlebar inset styling", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider defaultOpen={false}>
        <div />
      </SidebarProvider>,
    );

    expect(html).toContain('data-sidebar-state="collapsed"');
  });

  it("keeps the sidebar trigger interactive inside Electron drag regions", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <SidebarTrigger />
      </SidebarProvider>,
    );

    expect(html).toContain("[-webkit-app-region:no-drag]");
    expect(html).toContain("size-[var(--workspace-titlebar-control-size)]!");
  });

  it("uses shared geometry and icon constraints for menu buttons by default", () => {
    const html = renderSidebarButton();

    expect(html).toContain('data-slot="sidebar-menu-button"');
    expect(html).toContain("h-8");
    expect(html).toContain("rounded-[var(--control-radius)]");
    expect(html).toContain("px-[var(--sidebar-row-content-inset)]");
    expect(html).toContain("py-1.5");
    expect(html).toContain("]:size-4");
    expect(html).toContain("]:shrink-0");
    expect(html).toContain("cursor-pointer");
    expect(html).toContain("gap-[var(--sidebar-control-gap)]");
    expect(html).toContain("text-[var(--sidebar-icon-color)]");
    expect(html).not.toContain("[&amp;&gt;svg]:opacity-60");
  });

  it("applies the shared default treatment to icon-only menu buttons", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <SidebarMenuButton size="icon">
          <span>+</span>
        </SidebarMenuButton>
      </SidebarProvider>,
    );

    expect(html).toContain("size-8");
    expect(html).toContain("justify-center");
    expect(html).toContain("p-0");
    expect(html).toContain("font-medium");
    expect(html).toContain("text-sidebar-muted-foreground/80");
  });

  it("lets project drag handles override the default pointer cursor", () => {
    const html = renderSidebarButton("cursor-grab");

    expect(html).toContain("cursor-grab");
    expect(html).not.toContain("cursor-pointer");
  });

  it("uses a pointer cursor for menu actions", () => {
    const html = renderToStaticMarkup(
      <SidebarMenuAction aria-label="Create thread">
        <span>+</span>
      </SidebarMenuAction>,
    );

    expect(html).toContain('data-slot="sidebar-menu-action"');
    expect(html).toContain("cursor-pointer");
  });

  it("uses a pointer cursor for submenu buttons", () => {
    const html = renderToStaticMarkup(
      <SidebarMenuSubButton render={<button type="button" />}>Show more</SidebarMenuSubButton>,
    );

    expect(html).toContain('data-slot="sidebar-menu-sub-button"');
    expect(html).toContain("cursor-pointer");
  });
});
