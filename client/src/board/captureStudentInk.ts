import type { StudentStroke } from "@mentora/shared";
import type { BoardObject } from "./ObjectRegistry";
import { BOARD_HEIGHT, BOARD_WIDTH, type PixelBox } from "./boardSpatialMap";

const PAD = 48;
const GUTTER = 40;

function unionBounds(boxes: PixelBox[]): PixelBox | null {
  if (!boxes.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
}

function strokeBox(stroke: StudentStroke): PixelBox | null {
  if (stroke.bounds) {
    return {
      x: stroke.bounds.x,
      y: stroke.bounds.y,
      w: Math.max(1, stroke.bounds.width),
      h: Math.max(1, stroke.bounds.height),
    };
  }
  if (stroke.points.length < 4) return null;
  const xs = stroke.points.filter((_, i) => i % 2 === 0);
  const ys = stroke.points.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

function objectBox(obj: BoardObject): PixelBox {
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
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      x,
      y,
      w: Math.max(1, Math.max(...xs) - x),
      h: Math.max(1, Math.max(...ys) - y),
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
  const fs = obj.fontSize ?? 22;
  return {
    x: obj.x,
    y: obj.y,
    w: Math.min(400, Math.ceil(label.length * fs * 0.56)),
    h: Math.ceil(fs * 1.35),
  };
}

function boxesOverlap(a: PixelBox, b: PixelBox, pad = 8): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  obj: BoardObject,
  ox: number,
  oy: number,
) {
  ctx.save();
  const isAi = obj.layer !== "student";
  // AI context is faded + labeled; student placements stay opaque.
  ctx.globalAlpha = isAi ? 0.4 : 0.9;
  ctx.strokeStyle = isAi ? "rgba(22,78,59,0.55)" : (obj.stroke ?? "#164e3b");
  ctx.fillStyle = obj.fill ?? "transparent";
  ctx.lineWidth = obj.strokeWidth ?? 2;

  if (obj.type === "rectangle") {
    ctx.strokeRect(obj.x - ox, obj.y - oy, obj.width ?? 40, obj.height ?? 40);
  } else if (obj.type === "circle") {
    ctx.beginPath();
    ctx.arc(obj.x - ox, obj.y - oy, obj.radius ?? 20, 0, Math.PI * 2);
    ctx.stroke();
  } else if (
    (obj.type === "line" || obj.type === "arrow") &&
    obj.points &&
    obj.points.length >= 4
  ) {
    ctx.beginPath();
    ctx.moveTo(obj.points[0]! - ox, obj.points[1]! - oy);
    for (let i = 2; i < obj.points.length; i += 2) {
      ctx.lineTo(obj.points[i]! - ox, obj.points[i + 1]! - oy);
    }
    ctx.stroke();
  } else if (obj.type === "text" || obj.type === "equation") {
    ctx.globalAlpha = isAi ? 0.45 : 0.95;
    ctx.fillStyle = isAi ? "rgba(22,78,59,0.7)" : (obj.fill ?? "#164e3b");
    ctx.font = `${obj.fontSize ?? 22}px Literata, Georgia, serif`;
    ctx.fillText(
      obj.text ?? obj.latex ?? obj.id,
      obj.x - ox,
      obj.y - oy + (obj.fontSize ?? 22),
    );
  }

  if (isAi) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#0f766e";
    ctx.font = "bold 10px Source Sans 3, system-ui, sans-serif";
    ctx.fillText("AI", obj.x - ox, Math.max(10, obj.y - oy - 4));
  }
  ctx.restore();
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StudentStroke,
  ox: number,
  oy: number,
) {
  if (stroke.points.length < 4) return;
  ctx.save();
  ctx.strokeStyle = stroke.stroke || "#164e3b";
  ctx.lineWidth = stroke.strokeWidth || 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(stroke.points[0]! - ox, stroke.points[1]! - oy);
  for (let i = 2; i < stroke.points.length; i += 2) {
    ctx.lineTo(stroke.points[i]! - ox, stroke.points[i + 1]! - oy);
  }
  ctx.stroke();
  ctx.restore();
}

export type StudentInkCapture = {
  dataUrl: string;
  crop: PixelBox;
  ink: PixelBox;
  note: string;
};

/**
 * Build a PNG crop of student ink + nearby board context, with pixel coordinate marks.
 * Invisible to the student UI — only sent to the Realtime model.
 */
export function captureAnnotatedStudentInk(input: {
  strokes: StudentStroke[];
  objects: BoardObject[];
  extraBoxes?: PixelBox[];
}): StudentInkCapture | null {
  const inkBoxes = input.strokes
    .map(strokeBox)
    .filter((b): b is PixelBox => Boolean(b));
  const ink = unionBounds([...inkBoxes, ...(input.extraBoxes ?? [])]);
  if (!ink) return null;

  const x0 = Math.max(0, Math.floor(ink.x - PAD));
  const y0 = Math.max(0, Math.floor(ink.y - PAD));
  const x1 = Math.min(BOARD_WIDTH, Math.ceil(ink.x + ink.w + PAD));
  const y1 = Math.min(BOARD_HEIGHT, Math.ceil(ink.y + ink.h + PAD));
  const crop: PixelBox = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };

  const nearby = input.objects.filter((obj) =>
    boxesOverlap(objectBox(obj), crop, 4),
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(crop.w + GUTTER * 2);
  canvas.height = Math.ceil(crop.h + GUTTER * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Paper background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Light grid in crop space
  ctx.strokeStyle = "rgba(22,78,59,0.08)";
  ctx.lineWidth = 1;
  for (let gx = Math.ceil(crop.x / 40) * 40; gx < crop.x + crop.w; gx += 40) {
    const lx = GUTTER + (gx - crop.x);
    ctx.beginPath();
    ctx.moveTo(lx, GUTTER);
    ctx.lineTo(lx, GUTTER + crop.h);
    ctx.stroke();
  }
  for (let gy = Math.ceil(crop.y / 40) * 40; gy < crop.y + crop.h; gy += 40) {
    const ly = GUTTER + (gy - crop.y);
    ctx.beginPath();
    ctx.moveTo(GUTTER, ly);
    ctx.lineTo(GUTTER + crop.w, ly);
    ctx.stroke();
  }

  // Board content clip
  ctx.save();
  ctx.beginPath();
  ctx.rect(GUTTER, GUTTER, crop.w, crop.h);
  ctx.clip();
  const ox = crop.x - GUTTER;
  const oy = crop.y - GUTTER;
  for (const obj of nearby) drawObject(ctx, obj, ox, oy);
  for (const stroke of input.strokes) drawStroke(ctx, stroke, ox, oy);
  ctx.restore();

  // Outer crop frame
  ctx.strokeStyle = "rgba(22,78,59,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(GUTTER + 0.5, GUTTER + 0.5, crop.w - 1, crop.h - 1);

  // Ink bounds highlight (pixel-aware)
  const ix = GUTTER + (ink.x - crop.x);
  const iy = GUTTER + (ink.y - crop.y);
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "rgba(225, 29, 72, 0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(ix, iy, ink.w, ink.h);
  ctx.setLineDash([]);

  // Corner ticks + pixel labels
  ctx.fillStyle = "#e11d48";
  ctx.font = "11px Source Sans 3, system-ui, sans-serif";
  const corners: Array<{ x: number; y: number; label: string; ax: CanvasTextAlign; ay: CanvasTextBaseline }> = [
    {
      x: ix,
      y: iy,
      label: `px ${Math.round(ink.x)},${Math.round(ink.y)}`,
      ax: "left",
      ay: "bottom",
    },
    {
      x: ix + ink.w,
      y: iy,
      label: `px ${Math.round(ink.x + ink.w)},${Math.round(ink.y)}`,
      ax: "right",
      ay: "bottom",
    },
    {
      x: ix,
      y: iy + ink.h,
      label: `px ${Math.round(ink.x)},${Math.round(ink.y + ink.h)}`,
      ax: "left",
      ay: "top",
    },
    {
      x: ix + ink.w,
      y: iy + ink.h,
      label: `px ${Math.round(ink.x + ink.w)},${Math.round(ink.y + ink.h)}`,
      ax: "right",
      ay: "top",
    },
  ];
  for (const c of corners) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = c.ax;
    ctx.textBaseline = c.ay;
    const ty = c.ay === "bottom" ? c.y - 5 : c.y + 5;
    ctx.fillText(c.label, c.x, ty);
  }

  // Header strip
  ctx.fillStyle = "#164e3b";
  ctx.font = "bold 12px Source Sans 3, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(
    `Student ink crop · dashed red = student · faded+AI tag = Mentora (ignore as answer)`,
    GUTTER,
    10,
  );

  const aiNearby = nearby.filter((o) => o.layer !== "student").length;
  const studentNearby = nearby.filter((o) => o.layer === "student").length;
  const note = [
    `student_ink_image: crop px ${Math.round(crop.x)},${Math.round(crop.y)} to ${Math.round(crop.x + crop.w)},${Math.round(crop.y + crop.h)}`,
    `ink_bounds: px ${Math.round(ink.x)},${Math.round(ink.y)} to ${Math.round(ink.x + ink.w)},${Math.round(ink.y + ink.h)}`,
    `ink_center: ${Math.round(ink.x + ink.w / 2)},${Math.round(ink.y + ink.h / 2)}`,
    `Dashed red box = STUDENT ink only. Faded shapes tagged "AI" are Mentora's drawings — NOT student answers.`,
    `nearby_objects: student=${studentNearby}, ai_context=${aiNearby}`,
  ].join("\n");

  return {
    dataUrl: canvas.toDataURL("image/png"),
    crop,
    ink,
    note,
  };
}

/** Idle time after the student stops drawing before Mentora is notified. */
export const STUDENT_DRAW_IDLE_MS = 5000;
