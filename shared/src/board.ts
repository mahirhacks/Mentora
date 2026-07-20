import { z } from "zod";

export const BoardObjectTypeSchema = z.enum([
  "rectangle",
  "circle",
  "line",
  "arrow",
  "text",
  "equation",
  "label",
  "highlight",
]);

export type BoardObjectType = z.infer<typeof BoardObjectTypeSchema>;

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const BaseAction = z.object({
  id: z.string().min(1).optional(),
});

export const DrawRectangleActionSchema = BaseAction.extend({
  type: z.literal("draw_rectangle"),
  objectId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  stroke: z.string().optional(),
  fill: z.string().optional(),
  strokeWidth: z.number().positive().optional(),
  label: z.string().optional(),
});

export const DrawCircleActionSchema = BaseAction.extend({
  type: z.literal("draw_circle"),
  objectId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  radius: z.number().positive(),
  stroke: z.string().optional(),
  fill: z.string().optional(),
  strokeWidth: z.number().positive().optional(),
});

export const DrawLineActionSchema = BaseAction.extend({
  type: z.literal("draw_line"),
  objectId: z.string().min(1),
  points: z.array(z.number()).min(4),
  stroke: z.string().optional(),
  strokeWidth: z.number().positive().optional(),
});

export const DrawArrowActionSchema = BaseAction.extend({
  type: z.literal("draw_arrow"),
  objectId: z.string().min(1),
  points: z.array(z.number()).min(4),
  stroke: z.string().optional(),
  strokeWidth: z.number().positive().optional(),
});

export const WriteTextActionSchema = BaseAction.extend({
  type: z.literal("write_text"),
  objectId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  text: z.string(),
  fontSize: z.number().positive().optional(),
  fill: z.string().optional(),
});

export const WriteEquationActionSchema = BaseAction.extend({
  type: z.literal("write_equation"),
  objectId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  latex: z.string().min(1),
  fontSize: z.number().positive().optional(),
  fill: z.string().optional(),
});

export const MoveObjectActionSchema = BaseAction.extend({
  type: z.literal("move_object"),
  objectId: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

export const EraseObjectActionSchema = BaseAction.extend({
  type: z.literal("erase_object"),
  objectId: z.string().min(1),
});

export const ClearBoardActionSchema = BaseAction.extend({
  type: z.literal("clear_board"),
});

export const ClearStudentLayerActionSchema = BaseAction.extend({
  type: z.literal("clear_student_layer"),
});

export const PauseActionSchema = BaseAction.extend({
  type: z.literal("pause"),
  ms: z.number().int().positive().max(5000).default(400),
});

export const PointAtActionSchema = BaseAction.extend({
  type: z.literal("point_at"),
  objectId: z.string().min(1),
  holdMs: z.number().int().positive().max(20000).default(3500),
});

/** Red teaching pointer — prefer objectId (Set-of-Marks); x/y only as escape hatch. */
export const ShowPointerActionSchema = BaseAction.extend({
  type: z.literal("show_pointer"),
  objectId: z.string().min(1).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  holdMs: z.number().int().positive().max(20000).default(3500),
});

export const HighlightActionSchema = BaseAction.extend({
  type: z.literal("highlight"),
  objectId: z.string().min(1),
  holdMs: z.number().int().positive().max(20000).default(3500),
  color: z.string().optional(),
});

export const ClearFocusActionSchema = BaseAction.extend({
  type: z.literal("clear_focus"),
});

export const BoardActionSchema = z.discriminatedUnion("type", [
  DrawRectangleActionSchema,
  DrawCircleActionSchema,
  DrawLineActionSchema,
  DrawArrowActionSchema,
  WriteTextActionSchema,
  WriteEquationActionSchema,
  MoveObjectActionSchema,
  EraseObjectActionSchema,
  ClearBoardActionSchema,
  ClearStudentLayerActionSchema,
  PauseActionSchema,
  PointAtActionSchema,
  ShowPointerActionSchema,
  HighlightActionSchema,
  ClearFocusActionSchema,
]);

export type BoardAction = z.infer<typeof BoardActionSchema>;

export const BoardApplyActionsArgsSchema = z.object({
  actions: z.array(BoardActionSchema).min(1).max(40),
});

export type BoardApplyActionsArgs = z.infer<typeof BoardApplyActionsArgsSchema>;

/** Zone-based placement — model picks zone + content; client assigns pixels. */
export const BoardPlaceBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("heading"),
    text: z.string().min(1).max(200),
    objectId: z.string().min(1).max(64),
  }),
  z.object({
    kind: z.literal("body"),
    text: z.string().min(1).max(500),
    objectId: z.string().min(1).max(64),
  }),
  z.object({
    kind: z.literal("bullets"),
    lines: z.array(z.string().min(1).max(200)).min(1).max(8),
    objectIdPrefix: z.string().min(1).max(48),
  }),
  z.object({
    kind: z.literal("callout"),
    text: z.string().min(1).max(400),
    objectId: z.string().min(1).max(64),
  }),
]);

export const BoardPlaceArgsSchema = z.object({
  zone: z.enum(["title", "left", "right", "bottom"]),
  clearZone: z.boolean().optional().default(false),
  blocks: z.array(BoardPlaceBlockSchema).min(1).max(12),
});

export type BoardPlaceArgs = z.infer<typeof BoardPlaceArgsSchema>;
export type BoardPlaceBlock = z.infer<typeof BoardPlaceBlockSchema>;

export const BoardApplyActionsResultSchema = z.object({
  success: z.boolean(),
  applied: z.array(z.string()),
  error: z.string().optional(),
  objectId: z.string().optional(),
  availableObjectIds: z.array(z.string()).optional(),
  issues: z.array(z.string()).optional(),
});

export type BoardApplyActionsResult = z.infer<
  typeof BoardApplyActionsResultSchema
>;

export const BLOCKING_ACTION_TYPES = new Set([
  "draw_rectangle",
  "draw_circle",
  "draw_line",
  "draw_arrow",
  "write_text",
  "write_equation",
  "move_object",
  "erase_object",
  "clear_board",
  "clear_student_layer",
  "pause",
]);

export const NON_BLOCKING_FOCUS_TYPES = new Set([
  "point_at",
  "show_pointer",
  "highlight",
  "clear_focus",
]);

export function isBlockingAction(action: BoardAction): boolean {
  return BLOCKING_ACTION_TYPES.has(action.type);
}

export const StudentStrokeSchema = z.object({
  id: z.string().min(1),
  points: z.array(z.number()).min(4),
  stroke: z.string().default("#164e3b"),
  strokeWidth: z.number().positive().default(3),
  bounds: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

export type StudentStroke = z.infer<typeof StudentStrokeSchema>;

export const StudentBoardUpdateSchema = z.object({
  strokeIds: z.array(z.string()),
  strokeCount: z.number().int().nonnegative(),
  bounds: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  nearestObjectIds: z.array(z.string()).default([]),
  intentHint: z
    .enum(["attempting_answer", "showing_idea", "annotating", "unknown"])
    .default("unknown"),
  timestamp: z.number().int(),
});

export type StudentBoardUpdate = z.infer<typeof StudentBoardUpdateSchema>;
