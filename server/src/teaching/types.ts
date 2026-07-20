import type { SpeakDirective } from "../../voice/types.js";
import type { BoardObject, BoardState, Bounds, BoardStyle } from "../../tools/types.js";
import type { VerifiedBoardObservation } from "../../voice/types.js";

export type {
  BoardObject,
  BoardState,
  Bounds,
  BoardStyle,
  SpeakDirective,
  VerifiedBoardObservation,
};

export type TeachingStep =
  | { kind: "speak"; directive: SpeakDirective; text?: string }
  | { kind: "tool"; toolName: string; input: Record<string, unknown> }
  | { kind: "observe"; text: string; boardObjectIds?: string[] };

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
      directive: SpeakDirective;
    }
  | {
      type: "voice_audio";
      index: number;
      speechId: string;
      audioBase64: string;
      mimeType: string;
    }
  | {
      type: "done";
      script: TeachingStep[];
      boardState: BoardState;
    }
  | { type: "error"; message: string };
