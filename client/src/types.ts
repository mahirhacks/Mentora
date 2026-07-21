export interface SpeakDirective {
  speechId: string;
  voiceScript: string;
  boardObjectIds: string[];
  finalQuestion: string | null;
}

export interface VerifiedBoardObservation {
  objects: Record<
    string,
    {
      id: string;
      kind: string;
      summary: string;
      region: string;
      createdBy: BoardActor;
      updatedBy: BoardActor;
    }
  >;
  relationships: string[];
  layoutSummary: string;
}

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
  groupId?: string;
  ghost?: boolean;
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

export interface ArrowObject extends BoardObjectBase {
  kind: "arrow";
  from: Point;
  to: Point;
  fromId?: string;
  toId?: string;
  label?: string;
  bidirectional?: boolean;
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

export type UserBoardAction =
  | {
      type: "shape";
      shape: "rectangle" | "circle" | "triangle";
      from: Point;
      to: Point;
    }
  | { type: "pencil"; points: Point[] }
  | { type: "arrow"; from: Point; to: Point }
  | { type: "point"; at: Point; targetId?: string }
  | { type: "move"; objectId: string; dx: number; dy: number }
  | { type: "erase"; objectId: string };

export type UserBoardTool =
  | "pointer"
  | "pencil"
  | "rectangle"
  | "triangle"
  | "circle"
  | "arrow"
  | "eraser";

export type TeachingStep =
  | { kind: "speak"; directive: SpeakDirective; text?: string }
  | { kind: "tool"; toolName: string; input: Record<string, unknown> }
  | { kind: "observe"; text: string; boardObjectIds?: string[] };

export type TranscriptEntry =
  | { id: string; kind: "speak"; text: string; speechId?: string }
  | { id: string; kind: "student"; text: string; source: "voice" | "chat" }
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
  | {
      type: "observe_context";
      index: number;
      context: string;
      observation?: VerifiedBoardObservation;
    }
  | {
      type: "speech_interpreted";
      index: number;
      speechId: string;
      naturalText: string;
      transcriptSource: "voice_model" | "fallback";
    }
  | {
      type: "voice_audio";
      index: number;
      speechId: string;
      audioBase64: string;
      mimeType: string;
    }
  | { type: "done"; script: TeachingStep[]; boardState: BoardState }
  | {
      type: "error";
      message: string;
      code?: string;
      recoverable?: boolean;
    };

export interface LessonEventEnvelope {
  turnId: string;
  sequence: number;
  event: LessonEvent;
}
