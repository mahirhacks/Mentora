import {
  boundsCenter,
  commitObject,
  getBounds,
  getObject,
  nextObjectId,
} from "./boardState.js";
import { fitBoundsInCanvas, fitPointInCanvas } from "./boundsGuard.js";
import { clearOverlappingBeforePlace } from "./placementGuard.js";
import type { BoardState, ToolDefinition } from "./types.js";

export interface PointAtInput {
  targetId?: string;
  x?: number;
  y?: number;
  label?: string;
  style?: {
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    opacity?: number;
  };
}

export interface PointAtResult {
  pointerId: string;
  tip: { x: number; y: number };
  label?: string;
}

export const pointAtTool: ToolDefinition<PointAtInput, PointAtResult> = {
  name: "point_at",
  description:
    "Place a pointer on the board aimed at a coordinate or an existing object. Provide targetId OR both x and y.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      targetId: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        description: "Existing object to point at. Omit if using x/y instead.",
      },
      x: { type: "number", description: "X coordinate when not using targetId." },
      y: { type: "number", description: "Y coordinate when not using targetId." },
      label: { type: "string", maxLength: 120 },
      style: {
        type: "object",
        additionalProperties: false,
        properties: {
          stroke: { type: "string" },
          fill: { type: "string" },
          strokeWidth: { type: "number", minimum: 0, maximum: 20 },
          opacity: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
  resultSchema: {
    type: "object",
    required: ["pointerId", "tip"],
    properties: {
      pointerId: { type: "string" },
      tip: {
        type: "object",
        required: ["x", "y"],
        properties: {
          x: { type: "number" },
          y: { type: "number" },
        },
      },
      label: { type: "string" },
    },
  },
  execute(input, state) {
    let tip: { x: number; y: number };

    if (input.targetId) {
      const target = getObject(state, input.targetId);
      tip = boundsCenter(getBounds(target));
    } else if (input.x !== undefined && input.y !== undefined) {
      tip = { x: input.x, y: input.y };
    } else {
      throw new Error("point_at requires targetId or x/y coordinates");
    }

    tip = fitPointInCanvas(tip);

    const pointerId = nextObjectId("pointer");
    const bounds = fitBoundsInCanvas({
      x: tip.x - 10,
      y: tip.y - 10,
      width: 20,
      height: 20,
    });

    clearOverlappingBeforePlace(state, bounds, {
      exceptIds: [pointerId, input.targetId].filter(Boolean) as string[],
      erasableKinds: new Set(["pointer", "text", "label"]),
    });

    const nextState = commitObject(state, {
      id: pointerId,
      kind: "pointer",
      targetId: input.targetId,
      tip,
      label: input.label,
      bounds,
      style: {
        stroke: "#e74c3c",
        fill: "#e74c3c",
        strokeWidth: 2,
        ...input.style,
      },
    });

    state.objects = nextState.objects;
    state.revision = nextState.revision;

    return {
      pointerId,
      tip,
      label: input.label,
    };
  },
};
