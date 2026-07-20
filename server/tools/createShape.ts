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
    if (points.length < 2) {
      throw new Error("line requires at least 2 points");
    }
    if (
      points.every(
        (point) =>
          point.x === points[0].x &&
          point.y === points[0].y,
      )
    ) {
      throw new Error("line points must not all be identical");
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

  if (input.shape === "polygon") {
    const points = input.points;
    if (!points || points.length < 3) {
      throw new Error("polygon requires at least 3 points");
    }
    const twiceArea = points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0);
    if (Math.abs(twiceArea) < 1) {
      throw new Error("polygon points must enclose a non-zero area");
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

function fitPointsToBounds(
  points: CreateShapeInput["points"],
  rawBounds: { x: number; y: number; width: number; height: number },
  fittedBounds: { x: number; y: number; width: number; height: number },
) {
  if (!points) {
    return undefined;
  }

  const scaleX = fittedBounds.width / Math.max(rawBounds.width, 1);
  const scaleY = fittedBounds.height / Math.max(rawBounds.height, 1);

  return points.map((point) => ({
    x: Math.round(
      fittedBounds.x + (point.x - rawBounds.x) * scaleX,
    ),
    y: Math.round(
      fittedBounds.y + (point.y - rawBounds.y) * scaleY,
    ),
  }));
}

function boundsContain(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
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
      id: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        description: "Optional stable object id.",
      },
      shape: {
        type: "string",
        enum: ["rectangle", "ellipse", "line", "polygon"],
      },
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number", minimum: 1, maximum: 1184 },
      height: { type: "number", minimum: 1, maximum: 624 },
      radius: {
        type: "number",
        minimum: 1,
        maximum: 312,
        description: "Used for ellipse.",
      },
      points: {
        type: "array",
        minItems: 2,
        maxItems: 32,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y"],
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
        },
      },
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
      label: { type: "string", maxLength: 120 },
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
    const rawBounds = resolveBounds(input);
    const bounds = fitShapeBoundsInCanvas(rawBounds);
    const points = fitPointsToBounds(input.points, rawBounds, bounds);
    const enclosesExistingObject = Object.values(state.objects).some(
      (object) => boundsContain(bounds, object.bounds),
    );
    const autoErased = clearOverlappingBeforePlace(state, bounds, {
      exceptIds: [objectId],
    });

    const nextState = commitObject(state, {
      id: objectId,
      kind: "shape",
      shape: input.shape,
      bounds,
      points,
      style: enclosesExistingObject
        ? {
            ...input.style,
            fill: "rgba(0, 0, 0, 0)",
          }
        : input.style,
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
