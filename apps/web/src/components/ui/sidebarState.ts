export type ResponsiveSidebarState = "expanded" | "collapsed";

export const MOBILE_SIDEBAR_SWIPE_MIN_DISTANCE = 72;
export const MOBILE_SIDEBAR_SWIPE_MAX_CROSS_AXIS_DISTANCE = 48;
export const MOBILE_SIDEBAR_SWIPE_DIRECTION_RATIO = 1.5;

export function shouldDismissMobileSidebarFromSwipe(input: {
  readonly side: "left" | "right";
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}): boolean {
  const horizontalDistance = input.endX - input.startX;
  const verticalDistance = Math.abs(input.endY - input.startY);
  const distanceTowardClosedEdge = input.side === "left" ? -horizontalDistance : horizontalDistance;

  return (
    distanceTowardClosedEdge >= MOBILE_SIDEBAR_SWIPE_MIN_DISTANCE &&
    verticalDistance <= MOBILE_SIDEBAR_SWIPE_MAX_CROSS_AXIS_DISTANCE &&
    distanceTowardClosedEdge >= verticalDistance * MOBILE_SIDEBAR_SWIPE_DIRECTION_RATIO
  );
}

export function resolveSidebarState(input: {
  isMobile: boolean;
  open: boolean;
  openMobile: boolean;
}): ResponsiveSidebarState {
  return (input.isMobile ? input.openMobile : input.open) ? "expanded" : "collapsed";
}
