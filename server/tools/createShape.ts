import {
  commitObject,
  nextObjectId,
} from "./boardState.js";
import { clearOverlappingBeforePlace } from "./placementGuard.js";
import { fitShapeBoundsInCanvas } from "./boundsGuard.js";
import type { BoardState, ShapeKind, ToolDefinition } from "./types.js";

export interface CreateShapeInput {
  id?: string;
  shape: ShapeKind;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: Array<{ x: number; y: number }>;
  style?: {
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    opacity?: number;
  };
  label?: string;
}

export interface CreateShapeResult {
  objectId: string;
  shape: ShapeKind;
  bounds: { x: number; y: number; width: number; height: number };
  autoErased?: string[];
}

function resolveBounds(input: CreateShapeInput) {
  if (input.shape === "ellipse") {
    const radius = input.radius ?? 40;
    return {
      x: input.x - radius,
      y: input.y - radius,
      width: radius * 2,
      height: radius * 2,
    };
  }

  if (input.shape === "line") {
    const points = input.points ?? [
      { x: input.x, y: input.y },
      { x: (input.x ?? 0) + (input.width ?? 120), y: input.y },
    ];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
    };
  }

  if (input.shape === "polygon") {
    const points = input.points;
    if (!points || points.length < 3) {
      throw new Error("polygon requires at least 3 points");
    }
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
    };
  }

  return {
    x: input.x,
    y: input.y,
    width: input.width ?? 120,
    height: input.height ?? 80,
  };
}

export const createShapeTool: ToolDefinition<CreateShapeInput, CreateShapeResult> = {
  name: "create_shape",
  description:
    "Create a geometric shape on the teaching board (rectangle, ellipse, line, or polygon).",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["shape", "x", "y"],
    properties: {
      id: { type: "string", description: "Optional stable object id." },
      shape: {
        type: "string",
        enum: ["rectangle", "ellipse", "line", "polygon"],
      },
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number" },
      height: { type: "number" },
      radius: { type: "number", description: "Used for ellipse." },
      points: {
        type: "array",
        items: {
          type: "object",
          required: ["x", "y"],
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
        },
      },
      style: {
        type: "object",
        properties: {
          stroke: { type: "string" },
          fill: { type: "string" },
          strokeWidth: { type: "number" },
          opacity: { type: "number" },
        },
      },
      label: { type: "string" },
    },
  },
  resultSchema: {
    type: "object",
    required: ["objectId", "shape", "bounds"],
    properties: {
      objectId: { type: "string" },
      shape: {
        type: "string",
        enum: ["rectangle", "ellipse", "line", "polygon"],
      },
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
    const objectId = input.id ?? nextObjectId("shape");
    const bounds = fitShapeBoundsInCanvas(resolveBounds(input));
    const autoErased = clearOverlappingBeforePlace(state, bounds, {
      exceptIds: [objectId],
    });

    const nextState = commitObject(state, {
      id: objectId,
      kind: "shape",
      shape: input.shape,
      bounds,
      points: input.points,
      style: input.style,
      label: input.label,
    });

    state.objects = nextState.objects;
    state.revision = nextState.revision;

    return {
      objectId,
      shape: input.shape,
      bounds,
      autoErased,
    };
  },
};
