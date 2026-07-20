import type { StudentStroke } from "@mentora/shared";
import type { BoardObject, BoardObjectRegistry } from "./ObjectRegistry";

export const BOARD_WIDTH = 1100;
export const BOARD_HEIGHT = 620;
export const BOARD_MARGIN = 40;

export type PixelBox = { x: number; y: number; w: number; h: number };

export type SpatialObject = {
  id: string;
  type: string;
  box: PixelBox;
  /** Short content hint for the model */
  content?: string;
  /** Who created this object — never treat ai as student work. */
  author: "ai" | "student";
};

export type BoardSpatialMap = {
  canvas: { width: number; height: number; origin: "top-left" };
  safeArea: PixelBox;
  objects: SpatialObject[];
  studentInk: {
    strokeCount: number;
    boxes: PixelBox[];
  };
  freeSlots: Array<PixelBox & { hint: string }>;
  overlaps: Array<{ a: string; b: string }>;
};

function estimateTextSize(text: string, fontSize: number): { w: number; h: number } {
  const lines = text.split("\n");
  const w = Math.min(
    BOARD_WIDTH - 80,
    Math.max(
      1,
      ...lines.map((line) => Math.ceil(Math.max(1, line.length) * fontSize * 0.56)),
    ),
  );
  return {
    w,
    h: Math.ceil(lines.length * fontSize * 1.35),
  };
}

export function objectPixelBox(obj: BoardObject): PixelBox {
  if (obj.type === "circle") {
    const r = obj.radius ?? 20;
    return { x: obj.x - r, y: obj.y - r, w: r * 2, h: r * 2 };
  }
  if (
    (obj.type === "line" || obj.type === "arrow") &&
    obj.points &&
    obj.points.length >= 4
  ) {
    const xs = obj.points.filter((_, i) => i % 2 === 0);
    const ys = obj.points.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      w: Math.max(1, maxX - minX),
      h: Math.max(1, maxY - minY),
    };
  }
  if (obj.type === "rectangle") {
    return {
      x: obj.x,
      y: obj.y,
      w: obj.width ?? 100,
      h: obj.height ?? 80,
    };
  }
  const label = obj.text ?? obj.latex ?? obj.id;
  const size = estimateTextSize(label, obj.fontSize ?? 22);
  return { x: obj.x, y: obj.y, w: size.w, h: size.h };
}

function boxesOverlap(a: PixelBox, b: PixelBox, pad = 4): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

function contentOf(obj: BoardObject): string | undefined {
  if (obj.text) return obj.text.slice(0, 48);
  if (obj.latex) return obj.latex.slice(0, 48);
  if (obj.type === "rectangle") return `rect ${obj.width}x${obj.height}`;
  if (obj.type === "circle") return `circle r=${obj.radius}`;
  return undefined;
}

/** Candidate free zones aligned with board_place layout zones. */
function computeFreeSlots(occupied: PixelBox[]): Array<PixelBox & { hint: string }> {
  const candidates: Array<PixelBox & { hint: string }> = [
    { x: 60, y: 36, w: 980, h: 72, hint: "title zone" },
    { x: 60, y: 120, w: 460, h: 390, hint: "left diagram zone" },
    { x: 560, y: 120, w: 480, h: 390, hint: "right explanation zone" },
    { x: 60, y: 528, w: 980, h: 64, hint: "bottom summary zone" },
  ];

  return candidates
    .map((slot) => {
      const hits = occupied.filter((b) => boxesOverlap(slot, b, 8));
      if (hits.length === 0) return slot;
      // Shrink toward unoccupied remnant if mostly free
      if (hits.length >= 2) return null;
      return null;
    })
    .filter((s): s is PixelBox & { hint: string } => s !== null)
    .slice(0, 4);
}

export function buildBoardSpatialMap(
  registry: BoardObjectRegistry,
  studentStrokes: StudentStroke[] = [],
): BoardSpatialMap {
  const objects: SpatialObject[] = registry.list().map((obj) => ({
    id: obj.id,
    type: obj.type,
    box: objectPixelBox(obj),
    content: contentOf(obj),
    author: obj.layer === "student" ? "student" : "ai",
  }));

  const inkBoxes: PixelBox[] = studentStrokes
    .filter((s) => s.bounds)
    .map((s) => ({
      x: s.bounds!.x,
      y: s.bounds!.y,
      w: Math.max(1, s.bounds!.width),
      h: Math.max(1, s.bounds!.height),
    }));

  const occupied = [...objects.map((o) => o.box), ...inkBoxes];
  const overlaps: Array<{ a: string; b: string }> = [];
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      if (boxesOverlap(objects[i]!.box, objects[j]!.box)) {
        overlaps.push({ a: objects[i]!.id, b: objects[j]!.id });
      }
    }
  }

  return {
    canvas: {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      origin: "top-left",
    },
    safeArea: {
      x: BOARD_MARGIN,
      y: BOARD_MARGIN,
      w: BOARD_WIDTH - BOARD_MARGIN * 2,
      h: BOARD_HEIGHT - BOARD_MARGIN * 2,
    },
    objects,
    studentInk: {
      strokeCount: studentStrokes.length,
      boxes: inkBoxes,
    },
    freeSlots: computeFreeSlots(occupied),
    overlaps,
  };
}

function boxRange(box: PixelBox): string {
  const x1 = Math.round(box.x);
  const y1 = Math.round(box.y);
  const x2 = Math.round(box.x + box.w);
  const y2 = Math.round(box.y + box.h);
  return `px ${x1},${y1} to ${x2},${y2}`;
}

/** Compact text the Realtime model can read quickly (no images). */
export function formatBoardSpatialMap(map: BoardSpatialMap): string {
  const lines: string[] = [
    `total pixels: ${map.canvas.width}x${map.canvas.height}`,
    `origin: top-left (+x right, +y down)`,
    `safe area: ${boxRange(map.safeArea)}`,
    `write_text/write_equation (x,y) = TOP-LEFT of text. draw_rectangle (x,y)=TOP-LEFT. draw_circle (x,y)=CENTER.`,
    `prose: prefer board_place zones (title|left|right|bottom) — client wraps text and sizes callout boxes.`,
    `diagrams: prefer board_diagram (create_shape, divide_region, place_relative, point_at by id) — never invent x/y.`,
    `pointer: use point_at {objectId} OR show_pointer {objectId} for the red glowing teaching dot while you explain.`,
    `AUTHORSHIP: [ai] = Mentora drew it (NOT student work). [student] = student placed it. student ink = freehand only.`,
  ];

  if (!map.objects.length) {
    lines.push("objects: (empty board)");
  } else {
    lines.push("objects:");
    for (const o of map.objects) {
      const c = o.content ? ` | "${o.content}"` : "";
      const cx = Math.round(o.box.x + o.box.w / 2);
      const cy = Math.round(o.box.y + o.box.h / 2);
      lines.push(
        `- [${o.author}] ${o.id} (${o.type}): ${boxRange(o.box)} | center ${cx},${cy}${c}`,
      );
    }
  }

  if (map.studentInk.strokeCount > 0) {
    lines.push(`student ink: ${map.studentInk.strokeCount} stroke(s)`);
    for (const b of map.studentInk.boxes) {
      lines.push(`- ink: ${boxRange(b)}`);
    }
  }

  if (map.overlaps.length) {
    lines.push(
      `OVERLAPS (fix before adding more): ${map.overlaps.map((p) => `${p.a}<->${p.b}`).join(", ")}`,
    );
  }

  if (map.freeSlots.length) {
    lines.push("free slots (prefer for NEW items):");
    for (const s of map.freeSlots) {
      lines.push(`- ${s.hint}: ${boxRange(s)}`);
    }
  } else {
    lines.push(
      "free slots: none clear — place in empty margins or erase/move crowded items first.",
    );
  }

  return lines.join("\n");
}

export function snapshotBoardForModel(
  registry: BoardObjectRegistry,
  studentStrokes: StudentStroke[] = [],
): { map: BoardSpatialMap; text: string } {
  const map = buildBoardSpatialMap(registry, studentStrokes);
  return { map, text: formatBoardSpatialMap(map) };
}
