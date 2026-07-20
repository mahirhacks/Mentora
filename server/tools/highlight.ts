import {
  commitObject,
  getBounds,
  getObject,
  nextObjectId,
} from "./boardState.js";
import { fitBoundsInCanvas } from "./boundsGuard.js";
import { clearOverlappingBeforePlace } from "./placementGuard.js";
import type { BoardState, ToolDefinition } from "./types.js";

export interface HighlightInput {
  targetId: string;
  padding?: number;
  style?: {
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    opacity?: number;
  };
  durationMs?: number;
}

export interface HighlightResult {
  highlightId: string;
  targetId: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export const highlightTool: ToolDefinition<HighlightInput, HighlightResult> = {
  name: "highlight",
  description:
    "Draw a temporary highlight around a board object to draw the student's attention to it.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["targetId"],
    properties: {
      targetId: { type: "string" },
      padding: { type: "number", default: 8 },
      style: {
        type: "object",
        properties: {
          stroke: { type: "string" },
          fill: { type: "string" },
          strokeWidth: { type: "number" },
          opacity: { type: "number" },
        },
      },
      durationMs: {
        type: "integer",
        description: "Optional duration hint for the client animation layer.",
      },
    },
  },
  resultSchema: {
    type: "object",
    required: ["highlightId", "targetId", "bounds"],
    properties: {
      highlightId: { type: "string" },
      targetId: { type: "string" },
      bounds: {
        type: "object",
        required: ["x", "y", "width", "height"],
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
        },
      },
    },
  },
  execute(input, state) {
    const target = getObject(state, input.targetId);
    const padding = input.padding ?? 8;
    const targetBounds = getBounds(target);
    const bounds = fitBoundsInCanvas({
      x: targetBounds.x - padding,
      y: targetBounds.y - padding,
      width: targetBounds.width + padding * 2,
      height: targetBounds.height + padding * 2,
    });

    const highlightId = nextObjectId("highlight");
    const autoErased = clearOverlappingBeforePlace(state, bounds, {
      exceptIds: [highlightId, input.targetId],
      erasableKinds: new Set(["highlight", "pointer"]),
    });

    const nextState = commitObject(state, {
      id: highlightId,
      kind: "highlight",
      targetId: input.targetId,
      bounds,
      style: {
        stroke: "#f5a623",
        strokeWidth: 3,
        fill: "rgba(245, 166, 35, 0.15)",
        ...input.style,
      },
      durationMs: input.durationMs,
    });

    state.objects = nextState.objects;
    state.revision = nextState.revision;

    return {
      highlightId,
      targetId: input.targetId,
      bounds,
    };
  },
};
