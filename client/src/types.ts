export type ShapeKind = "rectangle" | "ellipse" | "line" | "polygon";

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

export interface Point {
  x: number;
  y: number;
}

export interface BoardObjectBase {
  id: string;
  bounds: Bounds;
  style?: BoardStyle;
}

export interface ShapeObject extends BoardObjectBase {
  kind: "shape";
  shape: ShapeKind;
  points?: Point[];
  label?: string;
}

export interface LabelObject extends BoardObjectBase {
  kind: "label";
  text: string;
  anchorId: string;
  position: string;
}

export interface TextObject extends BoardObjectBase {
  kind: "text";
  text: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  align?: "left" | "center" | "right";
}

export interface DivisionObject extends BoardObjectBase {
  kind: "division";
  parentId: string;
  regionIndex: number;
}

export interface HighlightObject extends BoardObjectBase {
  kind: "highlight";
  targetId: string;
}

export interface PointerObject extends BoardObjectBase {
  kind: "pointer";
  targetId?: string;
  tip: Point;
  label?: string;
}

export type BoardObject =
  | ShapeObject
  | LabelObject
  | TextObject
  | DivisionObject
  | HighlightObject
  | PointerObject;

export interface BoardState {
  objects: Record<string, BoardObject>;
  revision: number;
}

export type TeachingStep =
  | { kind: "speak"; text: string }
  | { kind: "tool"; toolName: string; input: Record<string, unknown> }
  | { kind: "observe"; text: string };

export type TranscriptEntry =
  | { id: string; kind: "speak"; text: string }
  | { id: string; kind: "observe"; text: string; context?: string };

export type LessonEvent =
  | { type: "planning" }
  | { type: "step"; index: number; step: TeachingStep }
  | {
      type: "tool_result";
      index: number;
      ok: boolean;
      result?: unknown;
      error?: string;
      boardState: BoardState;
    }
  | { type: "observe_context"; index: number; context: string }
  | { type: "done"; script: TeachingStep[]; boardState: BoardState }
  | { type: "error"; message: string };
