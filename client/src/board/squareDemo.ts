import type { BoardAction } from "@mentora/shared";

const INK = "#164e3b";
const INK_SOFT = "rgba(22,78,59,0.08)";

/** Hard-coded square-formula board sequence for Phase 1 (no voice). */
export function squareFormulaBoardActions(): BoardAction[] {
  const originX = 360;
  const originY = 100;
  const size = 380;
  const a = 230;
  const b = size - a;

  return [
    {
      type: "draw_rectangle",
      objectId: "big_square",
      x: originX,
      y: originY,
      width: size,
      height: size,
      stroke: INK,
      fill: INK_SOFT,
    },
    { type: "pause", ms: 350 },
    {
      type: "write_text",
      objectId: "label_side_h",
      x: originX + size / 2 - 30,
      y: originY + size + 16,
      text: "a + b",
      fontSize: 24,
      fill: INK,
    },
    {
      type: "write_text",
      objectId: "label_side_v",
      x: originX - 54,
      y: originY + size / 2 - 12,
      text: "a + b",
      fontSize: 24,
      fill: INK,
    },
    { type: "pause", ms: 400 },
    {
      type: "draw_line",
      objectId: "split_v",
      points: [originX + a, originY, originX + a, originY + size],
      stroke: INK,
      strokeWidth: 2,
    },
    {
      type: "draw_line",
      objectId: "split_h",
      points: [originX, originY + a, originX + size, originY + a],
      stroke: INK,
      strokeWidth: 2,
    },
    { type: "pause", ms: 300 },
    {
      type: "write_equation",
      objectId: "region_a2",
      x: originX + a / 2 - 18,
      y: originY + a / 2 - 14,
      latex: "a^2",
      fontSize: 28,
      fill: INK,
    },
    {
      type: "write_equation",
      objectId: "region_ab1",
      x: originX + a + b / 2 - 16,
      y: originY + a / 2 - 14,
      latex: "ab",
      fontSize: 26,
      fill: INK,
    },
    {
      type: "write_equation",
      objectId: "region_ab2",
      x: originX + a / 2 - 16,
      y: originY + a + b / 2 - 14,
      latex: "ab",
      fontSize: 26,
      fill: INK,
    },
    {
      type: "write_equation",
      objectId: "region_b2",
      x: originX + a + b / 2 - 16,
      y: originY + a + b / 2 - 14,
      latex: "b^2",
      fontSize: 28,
      fill: INK,
    },
    { type: "pause", ms: 400 },
    {
      type: "point_at",
      objectId: "region_ab1",
      holdMs: 1800,
    },
    {
      type: "highlight",
      objectId: "region_ab2",
      holdMs: 1800,
      color: INK,
    },
    { type: "pause", ms: 500 },
    {
      type: "write_equation",
      objectId: "identity",
      x: originX,
      y: originY + size + 56,
      latex: "(a+b)^2 = a^2 + 2ab + b^2",
      fontSize: 30,
      fill: INK,
    },
  ];
}
