export type ShapeKind = "rectangle" | "ellipse" | "line" | "polygon";

export type RelativeRelation =
  | "above"
  | "below"
  | "left"
  | "right"
  | "inside"
  | "center";

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardStyle {
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  opacity?: number;
}

export type BoardActor = "ai" | "user";

export interface BoardObjectProvenance {
  createdBy?: BoardActor;
  updatedBy?: BoardActor;
}

export interface BoardActivity {
  id: string;
  actor: BoardActor;
  action: "create" | "draw" | "move" | "erase" | "arrow" | "point";
  objectIds: string[];
  summary: string;
  revision: number;
}

export interface ShapeObject {
  id: string;
  kind: "shape";
  shape: ShapeKind;
  bounds: Bounds;
  points?: Point[];
  style?: BoardStyle;
  label?: string;
}

export interface LabelObject {
  id: string;
  kind: "label";
  text: string;
  anchorId: string;
  position: "center" | "top" | "bottom" | "left" | "right";
  bounds: Bounds;
  style?: BoardStyle;
}

export interface DivisionObject {
  id: string;
  kind: "division";
  parentId: string;
  regionIndex: number;
  bounds: Bounds;
  style?: BoardStyle;
}

export interface HighlightObject {
  id: string;
  kind: "highlight";
  targetId: string;
  bounds: Bounds;
  style?: BoardStyle;
  durationMs?: number;
}

export interface PointerObject {
  id: string;
  kind: "pointer";
  targetId?: string;
  tip: Point;
  bounds: Bounds;
  label?: string;
  style?: BoardStyle;
}

export interface ArrowObject {
  id: string;
  kind: "arrow";
  from: Point;
  to: Point;
  fromId?: string;
  toId?: string;
  label?: string;
  bidirectional?: boolean;
  bounds: Bounds;
  style?: BoardStyle;
}

export interface TextObject {
  id: string;
  kind: "text";
  text: string;
  bounds: Bounds;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  align?: "left" | "center" | "right";
  maxWidth?: number;
  /** Shared id for words expanded from one write_text call. */
  groupId?: string;
  /** Reference-only block for a multi-word group; not drawn or hit-tested. */
  ghost?: boolean;
  style?: BoardStyle;
}

export type BoardObject =
  (
    | ShapeObject
    | LabelObject
    | TextObject
    | DivisionObject
    | HighlightObject
    | PointerObject
    | ArrowObject
  ) & BoardObjectProvenance;

export interface BoardState {
  objects: Record<string, BoardObject>;
  revision: number;
  activity?: BoardActivity[];
  /** Student-selected canvas background color (hex). */
  backgroundColor?: string;
}

export interface ToolDefinition<TInput = unknown, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  execute: (input: TInput, state: BoardState) => TResult;
}

export interface ToolSuccess<TResult> {
  ok: true;
  result: TResult;
  state: BoardState;
}

export interface ToolFailure {
  ok: false;
  error: string;
  state: BoardState;
}

export type ToolRunOutcome<TResult> = ToolSuccess<TResult> | ToolFailure;
