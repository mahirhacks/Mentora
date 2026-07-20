import { z } from "zod";
import type { BoardAction } from "./board.js";

/** Named canvas regions — model picks a region; we assign pixels. */
export const DIAGRAM_REGIONS = {
  title: { x: 60, y: 36, w: 980, h: 72 },
  left: { x: 60, y: 120, w: 460, h: 390 },
  right: { x: 560, y: 120, w: 480, h: 390 },
  bottom: { x: 60, y: 528, w: 980, h: 64 },
  center: { x: 300, y: 120, w: 500, h: 390 },
} as const;

export type DiagramRegionId = keyof typeof DIAGRAM_REGIONS;

export type DiagramBox = { x: number; y: number; w: number; h: number };

const INK = "#164e3b";
const INK_SOFT = "rgba(22,78,59,0.08)";

const DiagramCellSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(80).optional(),
  kind: z.enum(["text", "equation"]).optional().default("text"),
});

export const BoardDiagramOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create_shape"),
    objectId: z.string().min(1).max(64),
    shape: z.enum(["rectangle", "circle"]),
    region: z
      .enum(["title", "left", "right", "bottom", "center"])
      .optional()
      .default("left"),
    size: z.enum(["sm", "md", "lg"]).optional().default("lg"),
    label: z.string().max(40).optional(),
  }),
  z.object({
    op: z.literal("divide_region"),
    parentId: z.string().min(1).max(64),
    layout: z.enum([
      "2x2-grid",
      "1x2-row",
      "2x1-col",
      "3x1-row",
      "1x3-col",
    ]),
    /** Unequal column widths (normalized). Default equal. */
    colRatios: z.array(z.number().positive()).min(1).max(4).optional(),
    /** Unequal row heights (normalized). Default equal. */
    rowRatios: z.array(z.number().positive()).min(1).max(4).optional(),
    cells: z.array(DiagramCellSchema).min(1).max(9),
    drawGuides: z.boolean().optional().default(true),
  }),
  z.object({
    op: z.literal("label_in"),
    parentId: z.string().min(1).max(64),
    objectId: z.string().min(1).max(64),
    text: z.string().min(1).max(120),
    kind: z.enum(["text", "equation"]).optional().default("text"),
  }),
  z.object({
    op: z.literal("place_relative"),
    targetId: z.string().min(1).max(64),
    where: z.enum(["above", "below", "left", "right", "inside"]),
    objectId: z.string().min(1).max(64),
    text: z.string().max(200).optional(),
    latex: z.string().max(200).optional(),
    gap: z.enum(["tight", "normal", "far"]).optional().default("normal"),
  }),
  z.object({
    op: z.literal("point_at"),
    objectId: z.string().min(1).max(64),
    holdMs: z.number().int().positive().max(20000).optional().default(1800),
  }),
  z.object({
    op: z.literal("highlight"),
    objectId: z.string().min(1).max(64),
    holdMs: z.number().int().positive().max(20000).optional().default(1800),
  }),
  z.object({
    op: z.literal("pause"),
    ms: z.number().int().positive().max(5000).optional().default(400),
  }),
]);

export type BoardDiagramOp = z.infer<typeof BoardDiagramOpSchema>;

export const BoardDiagramArgsSchema = z.object({
  ops: z.array(BoardDiagramOpSchema).min(1).max(30),
});

export type BoardDiagramArgs = z.infer<typeof BoardDiagramArgsSchema>;

const SIZE_FRAC: Record<"sm" | "md" | "lg", number> = {
  sm: 0.42,
  md: 0.68,
  lg: 0.88,
};

const GAP_PX: Record<"tight" | "normal" | "far", number> = {
  tight: 8,
  normal: 16,
  far: 36,
};

function layoutDims(layout: BoardDiagramOp & { op: "divide_region" }): {
  cols: number;
  rows: number;
} {
  switch (layout.layout) {
    case "2x2-grid":
      return { cols: 2, rows: 2 };
    case "1x2-row":
      return { cols: 2, rows: 1 };
    case "2x1-col":
      return { cols: 1, rows: 2 };
    case "3x1-row":
      return { cols: 3, rows: 1 };
    case "1x3-col":
      return { cols: 1, rows: 3 };
  }
}

function normalizeRatios(n: number, ratios?: number[]): number[] {
  if (!ratios || ratios.length !== n) {
    return Array.from({ length: n }, () => 1 / n);
  }
  const sum = ratios.reduce((a, b) => a + b, 0) || 1;
  return ratios.map((r) => r / sum);
}

function estimateTextWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * 0.56);
}

function cellBoxes(
  parent: DiagramBox,
  cols: number,
  rows: number,
  colRatios?: number[],
  rowRatios?: number[],
): DiagramBox[] {
  const crs = normalizeRatios(cols, colRatios);
  const rrs = normalizeRatios(rows, rowRatios);
  const boxes: DiagramBox[] = [];
  let y = parent.y;
  for (let r = 0; r < rows; r++) {
    const h = parent.h * rrs[r]!;
    let x = parent.x;
    for (let c = 0; c < cols; c++) {
      const w = parent.w * crs[c]!;
      boxes.push({ x, y, w, h });
      x += w;
    }
    y += h;
  }
  return boxes;
}

function centerLabel(
  box: DiagramBox,
  text: string,
  fontSize: number,
): { x: number; y: number } {
  const tw = estimateTextWidth(text, fontSize);
  return {
    x: box.x + Math.max(4, (box.w - tw) / 2),
    y: box.y + Math.max(4, (box.h - fontSize * 1.2) / 2),
  };
}

function placeBeside(
  target: DiagramBox,
  where: "above" | "below" | "left" | "right" | "inside",
  text: string,
  fontSize: number,
  gap: number,
): { x: number; y: number; box: DiagramBox } {
  const tw = Math.max(40, estimateTextWidth(text, fontSize));
  const th = Math.ceil(fontSize * 1.35);
  let x = target.x;
  let y = target.y;
  if (where === "inside") {
    const p = centerLabel(target, text, fontSize);
    return { x: p.x, y: p.y, box: { x: p.x, y: p.y, w: tw, h: th } };
  }
  if (where === "below") {
    x = target.x + Math.max(0, (target.w - tw) / 2);
    y = target.y + target.h + gap;
  } else if (where === "above") {
    x = target.x + Math.max(0, (target.w - tw) / 2);
    y = target.y - gap - th;
  } else if (where === "left") {
    x = target.x - gap - tw;
    y = target.y + Math.max(0, (target.h - th) / 2);
  } else {
    x = target.x + target.w + gap;
    y = target.y + Math.max(0, (target.h - th) / 2);
  }
  return { x, y, box: { x, y, w: tw, h: th } };
}

/**
 * Compile coordinate-free diagram ops into pixel BoardActions.
 * `existing` supplies boxes for objects already on the board (by id).
 */
export function compileDiagramOps(
  ops: BoardDiagramOp[],
  existing: Record<string, DiagramBox> = {},
): { actions: BoardAction[]; boxes: Record<string, DiagramBox> } {
  const boxes: Record<string, DiagramBox> = { ...existing };
  const actions: BoardAction[] = [];

  const requireBox = (id: string): DiagramBox => {
    const box = boxes[id];
    if (!box) {
      throw new Error(`DIAGRAM_UNKNOWN_PARENT:${id}`);
    }
    return box;
  };

  for (const op of ops) {
    if (op.op === "create_shape") {
      const region = DIAGRAM_REGIONS[op.region ?? "left"];
      const frac = SIZE_FRAC[op.size ?? "lg"];
      if (op.shape === "rectangle") {
        const side = Math.min(region.w, region.h) * frac;
        const w = Math.min(region.w * 0.95, side);
        const h = Math.min(region.h * 0.95, side);
        const x = region.x + (region.w - w) / 2;
        const y = region.y + (region.h - h) / 2;
        boxes[op.objectId] = { x, y, w, h };
        actions.push({
          type: "draw_rectangle",
          objectId: op.objectId,
          x,
          y,
          width: w,
          height: h,
          stroke: INK,
          fill: INK_SOFT,
          label: op.label,
        });
      } else {
        const r = (Math.min(region.w, region.h) * frac) / 2;
        const cx = region.x + region.w / 2;
        const cy = region.y + region.h / 2;
        boxes[op.objectId] = { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
        actions.push({
          type: "draw_circle",
          objectId: op.objectId,
          x: cx,
          y: cy,
          radius: r,
          stroke: INK,
          fill: INK_SOFT,
        });
      }
      continue;
    }

    if (op.op === "divide_region") {
      const parent = requireBox(op.parentId);
      const { cols, rows } = layoutDims(op);
      const cells = cellBoxes(
        parent,
        cols,
        rows,
        op.colRatios,
        op.rowRatios,
      );
      if (op.drawGuides !== false) {
        const crs = normalizeRatios(cols, op.colRatios);
        const rrs = normalizeRatios(rows, op.rowRatios);
        let gx = parent.x;
        for (let c = 0; c < cols - 1; c++) {
          gx += parent.w * crs[c]!;
          actions.push({
            type: "draw_line",
            objectId: `${op.parentId}_split_v${c + 1}`,
            points: [gx, parent.y, gx, parent.y + parent.h],
            stroke: INK,
            strokeWidth: 2,
          });
        }
        let gy = parent.y;
        for (let r = 0; r < rows - 1; r++) {
          gy += parent.h * rrs[r]!;
          actions.push({
            type: "draw_line",
            objectId: `${op.parentId}_split_h${r + 1}`,
            points: [parent.x, gy, parent.x + parent.w, gy],
            stroke: INK,
            strokeWidth: 2,
          });
        }
      }
      for (let i = 0; i < op.cells.length; i++) {
        const cell = op.cells[i]!;
        const box = cells[i];
        if (!box) break;
        boxes[cell.id] = box;
        if (!cell.label) continue;
        const fontSize = 26;
        const pos = centerLabel(box, cell.label, fontSize);
        if (cell.kind === "equation") {
          actions.push({
            type: "write_equation",
            objectId: cell.id,
            x: pos.x,
            y: pos.y,
            latex: cell.label,
            fontSize,
            fill: INK,
          });
        } else {
          actions.push({
            type: "write_text",
            objectId: cell.id,
            x: pos.x,
            y: pos.y,
            text: cell.label,
            fontSize,
            fill: INK,
          });
        }
      }
      continue;
    }

    if (op.op === "label_in") {
      const parent = requireBox(op.parentId);
      const fontSize = 24;
      const pos = centerLabel(parent, op.text, fontSize);
      boxes[op.objectId] = {
        x: pos.x,
        y: pos.y,
        w: estimateTextWidth(op.text, fontSize),
        h: fontSize * 1.35,
      };
      if (op.kind === "equation") {
        actions.push({
          type: "write_equation",
          objectId: op.objectId,
          x: pos.x,
          y: pos.y,
          latex: op.text,
          fontSize,
          fill: INK,
        });
      } else {
        actions.push({
          type: "write_text",
          objectId: op.objectId,
          x: pos.x,
          y: pos.y,
          text: op.text,
          fontSize,
          fill: INK,
        });
      }
      continue;
    }

    if (op.op === "place_relative") {
      const target = requireBox(op.targetId);
      const content = (op.latex ?? op.text ?? "").trim();
      if (!content) continue;
      const fontSize = op.latex ? 28 : 22;
      const gap = GAP_PX[op.gap ?? "normal"];
      const placed = placeBeside(target, op.where, content, fontSize, gap);
      boxes[op.objectId] = placed.box;
      if (op.latex) {
        actions.push({
          type: "write_equation",
          objectId: op.objectId,
          x: placed.x,
          y: placed.y,
          latex: op.latex,
          fontSize,
          fill: INK,
        });
      } else {
        actions.push({
          type: "write_text",
          objectId: op.objectId,
          x: placed.x,
          y: placed.y,
          text: content,
          fontSize,
          fill: INK,
        });
      }
      continue;
    }

    if (op.op === "point_at") {
      actions.push({
        type: "point_at",
        objectId: op.objectId,
        holdMs: op.holdMs ?? 1800,
      });
      continue;
    }

    if (op.op === "highlight") {
      actions.push({
        type: "highlight",
        objectId: op.objectId,
        holdMs: op.holdMs ?? 1800,
        color: INK,
      });
      continue;
    }

    if (op.op === "pause") {
      actions.push({ type: "pause", ms: op.ms ?? 400 });
    }
  }

  return { actions, boxes };
}

/** Canonical (a+b)² area-model diagram — no raw coordinates in the source ops. */
export function squareFormulaDiagramOps(): BoardDiagramOp[] {
  return [
    {
      op: "create_shape",
      objectId: "big_square",
      shape: "rectangle",
      region: "center",
      size: "lg",
    },
    { op: "pause", ms: 350 },
    {
      op: "place_relative",
      targetId: "big_square",
      where: "below",
      objectId: "label_side_h",
      text: "a + b",
      gap: "tight",
    },
    {
      op: "place_relative",
      targetId: "big_square",
      where: "left",
      objectId: "label_side_v",
      text: "a + b",
      gap: "tight",
    },
    { op: "pause", ms: 400 },
    {
      op: "divide_region",
      parentId: "big_square",
      layout: "2x2-grid",
      colRatios: [0.605, 0.395],
      rowRatios: [0.605, 0.395],
      drawGuides: true,
      cells: [
        { id: "region_a2", label: "a^2", kind: "equation" },
        { id: "region_ab1", label: "ab", kind: "equation" },
        { id: "region_ab2", label: "ab", kind: "equation" },
        { id: "region_b2", label: "b^2", kind: "equation" },
      ],
    },
    { op: "pause", ms: 300 },
    { op: "point_at", objectId: "region_ab1", holdMs: 1800 },
    { op: "highlight", objectId: "region_ab2", holdMs: 1800 },
    { op: "pause", ms: 500 },
    {
      op: "place_relative",
      targetId: "big_square",
      where: "below",
      objectId: "identity",
      latex: "(a+b)^2 = a^2 + 2ab + b^2",
      gap: "far",
    },
  ];
}

export function squareFormulaBoardActions(): BoardAction[] {
  return compileDiagramOps(squareFormulaDiagramOps()).actions;
}
