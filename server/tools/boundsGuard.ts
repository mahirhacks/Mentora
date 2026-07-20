import type { Bounds } from "./types.js";
import {
  BOARD_HEIGHT,
  BOARD_SAFE_MARGIN,
  BOARD_WIDTH,
  SAFE_ZONE,
} from "./boardLayout.js";

export { BOARD_SAFE_MARGIN, SAFE_ZONE } from "./boardLayout.js";

export function fitBoundsInCanvas(bounds: Bounds): Bounds {
  let { x, y, width, height } = bounds;

  width = Math.min(Math.max(width, 1), SAFE_ZONE.width);
  height = Math.min(Math.max(height, 1), SAFE_ZONE.height);

  x = Math.max(SAFE_ZONE.x, x);
  y = Math.max(SAFE_ZONE.y, y);

  if (x + width > SAFE_ZONE.x + SAFE_ZONE.width) {
    x = SAFE_ZONE.x + SAFE_ZONE.width - width;
  }
  if (y + height > SAFE_ZONE.y + SAFE_ZONE.height) {
    y = SAFE_ZONE.y + SAFE_ZONE.height - height;
  }

  x = Math.max(SAFE_ZONE.x, x);
  y = Math.max(SAFE_ZONE.y, y);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function fitShapeBoundsInCanvas(bounds: Bounds): Bounds {
  let { x, y, width, height } = bounds;

  width = Math.min(Math.max(width, 1), SAFE_ZONE.width);
  height = Math.min(Math.max(height, 1), SAFE_ZONE.height);

  if (x < SAFE_ZONE.x) {
    x = SAFE_ZONE.x;
  }
  if (y < SAFE_ZONE.y) {
    y = SAFE_ZONE.y;
  }
  if (x + width > SAFE_ZONE.x + SAFE_ZONE.width) {
    x = SAFE_ZONE.x + SAFE_ZONE.width - width;
  }
  if (y + height > SAFE_ZONE.y + SAFE_ZONE.height) {
    y = SAFE_ZONE.y + SAFE_ZONE.height - height;
  }

  return fitBoundsInCanvas({ x, y, width, height });
}

export function fitPointInCanvas(point: { x: number; y: number }) {
  return {
    x: Math.round(
      Math.min(
        Math.max(point.x, SAFE_ZONE.x),
        SAFE_ZONE.x + SAFE_ZONE.width,
      ),
    ),
    y: Math.round(
      Math.min(
        Math.max(point.y, SAFE_ZONE.y),
        SAFE_ZONE.y + SAFE_ZONE.height,
      ),
    ),
  };
}

export function canvasBoundaryGuide(): string {
  const leftPanelMax = Math.round(BOARD_WIDTH * 0.33);
  const rightPanelMin = Math.round(BOARD_WIDTH * 0.67);
  const safeRight = SAFE_ZONE.x + SAFE_ZONE.width;

  return [
    `Canvas pixels: ${BOARD_WIDTH} wide x ${BOARD_HEIGHT} tall.`,
    `Visible safe zone: x=${SAFE_ZONE.x}..${safeRight}, y=${SAFE_ZONE.y}..${SAFE_ZONE.y + SAFE_ZONE.height}.`,
    "All content must stay inside the safe zone. The executor clamps out-of-bounds placements.",
    "Column layout (use these x anchors):",
    `- left panel: x=${SAFE_ZONE.x + 24}..${leftPanelMax}, align=left`,
    `- center: x=${Math.round(BOARD_WIDTH * 0.5)}, align=center for titles`,
    `- right panel: x=${rightPanelMin}..${safeRight - 24}, align=right`,
    "Never place side-column text near x=0 or x=1280 — those coordinates clip off-screen.",
    "For multi-line side notes, set maxWidth to 280 or less.",
  ].join("\n");
}
