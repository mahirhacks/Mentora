import type { BoardObject, BoardState, Bounds } from "./types.js";
import { getTeachingColorPalette } from "./colorPalette.js";

export const BOARD_WIDTH = 1280;
export const BOARD_HEIGHT = 720;
export const BOARD_SAFE_MARGIN = 48;

export const SAFE_ZONE: Bounds = {
  x: BOARD_SAFE_MARGIN,
  y: BOARD_SAFE_MARGIN,
  width: BOARD_WIDTH - BOARD_SAFE_MARGIN * 2,
  height: BOARD_HEIGHT - BOARD_SAFE_MARGIN * 2,
};

export interface BoardLayoutEntry {
  id: string;
  kind: BoardObject["kind"];
  summary: string;
  createdBy: "ai" | "user";
  updatedBy: "ai" | "user";
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  region: string;
}

function describeRegion(x: number, y: number, width: number, height: number) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  const horizontal =
    centerX < BOARD_WIDTH * 0.33
      ? "left"
      : centerX > BOARD_WIDTH * 0.66
        ? "right"
        : "center";
  const vertical =
    centerY < BOARD_HEIGHT * 0.33
      ? "top"
      : centerY > BOARD_HEIGHT * 0.66
        ? "bottom"
        : "middle";

  return `${vertical}-${horizontal}`;
}

function summarizeObject(object: BoardObject): string {
  if (object.kind === "shape") {
    return `${object.shape}${object.label ? ` "${object.label}"` : ""}`;
  }
  if (object.kind === "text" || object.kind === "label") {
    return `"${object.text}"`;
  }
  if (object.kind === "division") {
    return `division ${object.regionIndex + 1} of ${object.parentId}`;
  }
  if (object.kind === "highlight") {
    return `highlight on ${object.targetId}`;
  }
  if (object.kind === "pointer") {
    return `pointer${object.label ? ` "${object.label}"` : ""}`;
  }
  if (object.kind === "arrow") {
    const from = object.fromId ?? `(${object.from.x},${object.from.y})`;
    const to = object.toId ?? `(${object.to.x},${object.to.y})`;
    return `arrow ${from} → ${to}${object.label ? ` "${object.label}"` : ""}`;
  }
  return (object as BoardObject).kind;
}

export function buildBoardLayoutCatalog(
  boardState: BoardState,
): BoardLayoutEntry[] {
  return Object.values(boardState.objects).map((object) => {
    const { x, y, width, height } = object.bounds;
    return {
      id: object.id,
      kind: object.kind,
      summary: summarizeObject(object),
      createdBy: object.createdBy ?? "ai",
      updatedBy: object.updatedBy ?? object.createdBy ?? "ai",
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      centerX: Math.round(x + width / 2),
      centerY: Math.round(y + height / 2),
      region: describeRegion(x, y, width, height),
    };
  });
}

export function formatBoardLayoutForPrompt(boardState: BoardState): string {
  const catalog = buildBoardLayoutCatalog(boardState);
  if (catalog.length === 0) {
    return "No objects on the board.";
  }

  return catalog
    .map(
      (entry) =>
        `- ${entry.id} [${entry.kind}] ${entry.summary} | created-by ${entry.createdBy}, last-updated-by ${entry.updatedBy} | bounds (x=${entry.x}, y=${entry.y}, w=${entry.width}, h=${entry.height}) | center (${entry.centerX}, ${entry.centerY}) | region ${entry.region}`,
    )
    .join("\n");
}

export function formatBoardStateForPrompt(boardState: BoardState): string {
  const backgroundColor = boardState.backgroundColor ?? "#f7f7f8";
  const palette = getTeachingColorPalette(backgroundColor);
  return JSON.stringify(
    {
      canvas: {
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        backgroundColor: palette.canvas_color,
        backgroundLabel: palette.canvas_label,
        color_palette: {
          marking_color: palette.marking_color,
          headline_1_color: palette.headline_1_color,
          headline_2_color: palette.headline_2_color,
          body_text_color: palette.body_text_color,
          shape_stroke_color: palette.shape_stroke_color,
          shape_fill_color: palette.shape_fill_color,
          accent_color: palette.accent_color,
          highlight_color: palette.highlight_color,
          arrow_color: palette.arrow_color,
        },
        safeZone: {
          x: SAFE_ZONE.x,
          y: SAFE_ZONE.y,
          width: SAFE_ZONE.width,
          height: SAFE_ZONE.height,
          xMax: SAFE_ZONE.x + SAFE_ZONE.width,
          yMax: SAFE_ZONE.y + SAFE_ZONE.height,
        },
      },
      revision: boardState.revision,
      objectCount: Object.keys(boardState.objects).length,
      recentUserActions: (boardState.activity ?? [])
        .filter((entry) => entry.actor === "user")
        .slice(-12),
      layoutCatalog: buildBoardLayoutCatalog(boardState),
      objects: boardState.objects,
    },
    null,
    2,
  );
}
