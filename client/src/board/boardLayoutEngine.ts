import type { BoardAction } from "@mentora/shared";
import type { BoardObjectRegistry } from "./ObjectRegistry";
import {
  BOARD_HEIGHT,
  BOARD_MARGIN,
  BOARD_WIDTH,
  objectPixelBox,
  type PixelBox,
} from "./boardSpatialMap";

function boxesOverlap(a: PixelBox, b: PixelBox, pad = 2): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

export type LayoutZoneId = "title" | "left" | "right" | "bottom";

export const LAYOUT_ZONES: Record<
  LayoutZoneId,
  PixelBox & { hint: string }
> = {
  title: { x: 60, y: 36, w: 980, h: 72, hint: "full-width title row" },
  left: { x: 60, y: 120, w: 460, h: 390, hint: "left diagram / key idea" },
  right: { x: 560, y: 120, w: 480, h: 390, hint: "right explanations" },
  bottom: { x: 60, y: 528, w: 980, h: 64, hint: "bottom summary strip" },
};

const SAFE = {
  x1: BOARD_MARGIN,
  y1: BOARD_MARGIN,
  x2: BOARD_WIDTH - BOARD_MARGIN,
  y2: BOARD_HEIGHT - BOARD_MARGIN,
};

export function estimateTextWidth(text: string, fontSize: number): number {
  // Average glyph width for Literata/serif-ish UI fonts
  return Math.ceil(text.length * fontSize * 0.56);
}

export function wrapTextToWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (estimateTextWidth(clean, fontSize) <= maxWidth) return clean;

  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  const pushWord = (word: string) => {
    if (estimateTextWidth(word, fontSize) <= maxWidth) {
      if (!current) current = word;
      else if (estimateTextWidth(`${current} ${word}`, fontSize) <= maxWidth) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
      return;
    }
    // Hard-break oversized tokens so they never clip off-canvas
    if (current) {
      lines.push(current);
      current = "";
    }
    let chunk = "";
    for (const ch of word) {
      const next = chunk + ch;
      if (estimateTextWidth(next, fontSize) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = next;
      }
    }
    current = chunk;
  };

  for (const word of words) pushWord(word);
  if (current) lines.push(current);
  return lines.join("\n");
}

export function textBlockSize(
  text: string,
  fontSize: number,
): { w: number; h: number } {
  const lines = text.split("\n");
  const w = Math.max(
    1,
    ...lines.map((line) => estimateTextWidth(line || " ", fontSize)),
  );
  const h = Math.ceil(lines.length * fontSize * 1.35);
  return { w, h };
}

function clampTextAction(action: Extract<BoardAction, { type: "write_text" }>) {
  const fontSize = Math.max(16, Math.min(40, action.fontSize ?? 22));
  let x = action.x;
  let y = action.y;
  const maxWidth = Math.max(120, SAFE.x2 - Math.max(SAFE.x1, x) - 8);
  const wrapped = wrapTextToWidth(action.text, fontSize, maxWidth);
  const size = textBlockSize(wrapped, fontSize);
  if (x + size.w > SAFE.x2) x = Math.max(SAFE.x1, SAFE.x2 - size.w);
  if (y + size.h > SAFE.y2) y = Math.max(SAFE.y1, SAFE.y2 - size.h);
  x = Math.min(Math.max(x, SAFE.x1), SAFE.x2 - 20);
  y = Math.min(Math.max(y, SAFE.y1), SAFE.y2 - 20);
  return { ...action, x, y, fontSize, text: wrapped, fill: action.fill ?? "#164e3b" };
}

function clampEquationAction(
  action: Extract<BoardAction, { type: "write_equation" }>,
) {
  const fontSize = Math.max(16, Math.min(40, action.fontSize ?? 28));
  const size = textBlockSize(action.latex, fontSize);
  let x = action.x;
  let y = action.y;
  if (x + size.w > SAFE.x2) x = Math.max(SAFE.x1, SAFE.x2 - size.w);
  if (y + size.h > SAFE.y2) y = Math.max(SAFE.y1, SAFE.y2 - size.h);
  x = Math.min(Math.max(x, SAFE.x1), SAFE.x2 - 20);
  y = Math.min(Math.max(y, SAFE.y1), SAFE.y2 - 20);
  return { ...action, x, y, fontSize, fill: action.fill ?? "#164e3b" };
}

function clampRectAction(
  action: Extract<BoardAction, { type: "draw_rectangle" }>,
) {
  let x = Math.max(SAFE.x1, action.x);
  let y = Math.max(SAFE.y1, action.y);
  let width = Math.max(24, action.width);
  let height = Math.max(24, action.height);
  if (x + width > SAFE.x2) width = Math.max(24, SAFE.x2 - x);
  if (y + height > SAFE.y2) height = Math.max(24, SAFE.y2 - y);
  return { ...action, x, y, width, height };
}

/** Fix clipping / overflow before actions hit the board. */
export function normalizeBoardActions(actions: BoardAction[]): BoardAction[] {
  return actions.map((action) => {
    if (action.type === "write_text") return clampTextAction(action);
    if (action.type === "write_equation") return clampEquationAction(action);
    if (action.type === "draw_rectangle") return clampRectAction(action);
    if (action.type === "draw_circle") {
      const r = Math.max(8, action.radius);
      const x = Math.min(Math.max(action.x, SAFE.x1 + r), SAFE.x2 - r);
      const y = Math.min(Math.max(action.y, SAFE.y1 + r), SAFE.y2 - r);
      return { ...action, x, y, radius: r };
    }
    if (action.type === "show_pointer") {
      if (action.objectId) return action;
      return {
        ...action,
        x: Math.min(Math.max(action.x ?? 0, SAFE.x1), SAFE.x2),
        y: Math.min(Math.max(action.y ?? 0, SAFE.y1), SAFE.y2),
      };
    }
    return action;
  });
}

export type PlaceBlock =
  | { kind: "heading"; text: string; objectId: string }
  | { kind: "body"; text: string; objectId: string }
  | { kind: "bullets"; lines: string[]; objectIdPrefix: string }
  | { kind: "callout"; text: string; objectId: string };

/**
 * Deterministic zone layout — Mentora picks zone + content; we assign pixels.
 */
export function buildZonePlacement(input: {
  zone: LayoutZoneId;
  blocks: PlaceBlock[];
}): BoardAction[] {
  const zone = LAYOUT_ZONES[input.zone];
  const actions: BoardAction[] = [];
  let cursorY = zone.y + 8;
  const padX = zone.x + 12;
  const maxW = zone.w - 24;

  for (const block of input.blocks) {
    if (cursorY > zone.y + zone.h - 28) break;

    if (block.kind === "heading") {
      const fontSize = input.zone === "title" ? 32 : 26;
      const text = wrapTextToWidth(block.text, fontSize, maxW);
      const size = textBlockSize(text, fontSize);
      actions.push({
        type: "write_text",
        objectId: block.objectId,
        x: padX,
        y: cursorY,
        text,
        fontSize,
        fill: "#164e3b",
      });
      cursorY += size.h + 14;
      continue;
    }

    if (block.kind === "body") {
      const fontSize = 20;
      const text = wrapTextToWidth(block.text, fontSize, maxW);
      const size = textBlockSize(text, fontSize);
      actions.push({
        type: "write_text",
        objectId: block.objectId,
        x: padX,
        y: cursorY,
        text,
        fontSize,
        fill: "#164e3b",
      });
      cursorY += size.h + 12;
      continue;
    }

    if (block.kind === "bullets") {
      const fontSize = 19;
      for (let i = 0; i < block.lines.length; i++) {
        if (cursorY > zone.y + zone.h - 24) break;
        const line = wrapTextToWidth(
          `• ${block.lines[i]!.trim()}`,
          fontSize,
          maxW,
        );
        const size = textBlockSize(line, fontSize);
        actions.push({
          type: "write_text",
          objectId: `${block.objectIdPrefix}_${i + 1}`,
          x: padX,
          y: cursorY,
          text: line,
          fontSize,
          fill: "#164e3b",
        });
        cursorY += size.h + 8;
      }
      cursorY += 6;
      continue;
    }

    if (block.kind === "callout") {
      const fontSize = 18;
      const innerW = maxW - 24;
      const text = wrapTextToWidth(block.text, fontSize, innerW);
      const size = textBlockSize(text, fontSize);
      const boxH = size.h + 24;
      const boxW = Math.min(maxW, Math.max(size.w + 24, 180));
      if (cursorY + boxH > zone.y + zone.h) break;
      actions.push({
        type: "draw_rectangle",
        objectId: `${block.objectId}_box`,
        x: padX,
        y: cursorY,
        width: boxW,
        height: boxH,
        stroke: "#164e3b",
        fill: "rgba(22,78,59,0.06)",
      });
      actions.push({
        type: "write_text",
        objectId: block.objectId,
        x: padX + 12,
        y: cursorY + 12,
        text,
        fontSize,
        fill: "#164e3b",
      });
      cursorY += boxH + 12;
    }
  }

  return normalizeBoardActions(actions);
}

export function formatZonesForModel(): string {
  return (Object.keys(LAYOUT_ZONES) as LayoutZoneId[])
    .map((id) => {
      const z = LAYOUT_ZONES[id];
      return `- ${id}: px ${z.x},${z.y} to ${z.x + z.w},${z.y + z.h} (${z.hint})`;
    })
    .join("\n");
}

/** Erase AI objects that overlap a layout zone (before replacing content). */
export function eraseActionsForZone(
  registry: BoardObjectRegistry,
  zoneId: LayoutZoneId,
): BoardAction[] {
  const zone = LAYOUT_ZONES[zoneId];
  return registry
    .list()
    .filter((obj) => boxesOverlap(objectPixelBox(obj), zone))
    .map((obj) => ({ type: "erase_object" as const, objectId: obj.id }));
}
