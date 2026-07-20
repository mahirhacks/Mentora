export type {
  BoardObject,
  BoardState,
  Bounds,
  BoardStyle,
} from "../../tools/types.js";

export type TeachingStep =
  | { kind: "speak"; text: string }
  | { kind: "tool"; toolName: string; input: Record<string, unknown> }
  | { kind: "observe"; text: string };

export type LessonEvent =
  | { type: "planning" }
  | { type: "step"; index: number; step: TeachingStep }
  | {
      type: "tool_result";
      index: number;
      ok: boolean;
      result?: unknown;
      error?: string;
      boardState: import("../../tools/types.js").BoardState;
    }
  | {
      type: "observe_context";
      index: number;
      context: string;
    }
  | {
      type: "done";
      script: TeachingStep[];
      boardState: import("../../tools/types.js").BoardState;
    }
  | { type: "error"; message: string };
