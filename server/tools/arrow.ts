import {
  boundsCenter,
  commitObject,
  getBounds,
  getObject,
  nextObjectId,
} from "./boardState.js";
import { fitBoundsInCanvas, fitPointInCanvas } from "./boundsGuard.js";
import type { BoardState, Bounds, Point, ToolDefinition } from "./types.js";

export interface ArrowInput {
  id?: string;
  fromId?: string;
  toId?: string;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  label?: string;
  bidirectional?: boolean;
  style?: {
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    opacity?: number;
  };
}

export interface ArrowResult {
  arrowId: string;
  from: Point;
  to: Point;
  fromId?: string;
  toId?: string;
  label?: string;
}

function edgePointToward(bounds: Bounds, toward: Point): Point {
  const center = boundsCenter(bounds);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: center.x, y: center.y };
  }

  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;
  const scaleX = halfW / Math.max(Math.abs(dx), 0.001);
  const scaleY = halfH / Math.max(Math.abs(dy), 0.001);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: Math.round(center.x + dx * scale),
    y: Math.round(center.y + dy * scale),
  };
}

function resolveEndpoint(
  state: BoardState,
  objectId: string | undefined,
  x: number | undefined,
  y: number | undefined,
  toward: Point | null,
): Point {
  if (objectId) {
    const object = getObject(state, objectId);
    const bounds = getBounds(object);
    if (toward) {
      return edgePointToward(bounds, toward);
    }
    return boundsCenter(bounds);
  }

  if (x !== undefined && y !== undefined) {
    return fitPointInCanvas({ x, y });
  }

  throw new Error(
    "arrow requires fromId/toId or explicit fromX/fromY and toX/toY endpoints",
  );
}

export const arrowTool: ToolDefinition<ArrowInput, ArrowResult> = {
  name: "arrow",
  description:
    "Draw an arrow that connects two board objects or coordinates. Prefer fromId/toId to link existing visuals. Use for pointing from one concept to another, showing flow, or mapping cause → effect.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        description: "Optional stable arrow id.",
      },
      fromId: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        description: "Existing object the arrow starts from.",
      },
      toId: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        description: "Existing object the arrow points to.",
      },
      fromX: { type: "number" },
      fromY: { type: "number" },
      toX: { type: "number" },
      toY: { type: "number" },
      label: { type: "string", maxLength: 120 },
      bidirectional: {
        type: "boolean",
        description: "If true, draw arrowheads on both ends.",
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
    },
  },
  resultSchema: {
    type: "object",
    required: ["arrowId", "from", "to"],
    properties: {
      arrowId: { type: "string" },
      from: {
        type: "object",
        required: ["x", "y"],
        properties: { x: { type: "number" }, y: { type: "number" } },
      },
      to: {
        type: "object",
        required: ["x", "y"],
        properties: { x: { type: "number" }, y: { type: "number" } },
      },
      fromId: { type: "string" },
      toId: { type: "string" },
      label: { type: "string" },
    },
  },
  execute(input, state) {
    if (input.fromId && input.toId && input.fromId === input.toId) {
      throw new Error("arrow fromId and toId must be different objects");
    }

    const roughFromCenter =
      input.fromId
        ? boundsCenter(getBounds(getObject(state, input.fromId)))
        : input.fromX !== undefined && input.fromY !== undefined
          ? { x: input.fromX, y: input.fromY }
          : null;
    const roughToCenter =
      input.toId
        ? boundsCenter(getBounds(getObject(state, input.toId)))
        : input.toX !== undefined && input.toY !== undefined
          ? { x: input.toX, y: input.toY }
          : null;

    if (!roughFromCenter || !roughToCenter) {
      throw new Error(
        "arrow requires both a start and an end (object ids or coordinates)",
      );
    }

    const from = resolveEndpoint(
      state,
      input.fromId,
      input.fromX,
      input.fromY,
      roughToCenter,
    );
    const to = resolveEndpoint(
      state,
      input.toId,
      input.toX,
      input.toY,
      roughFromCenter,
    );

    if (from.x === to.x && from.y === to.y) {
      throw new Error("arrow start and end must not be the same point");
    }

    const arrowId = input.id ?? nextObjectId("arrow");
    const bounds = fitBoundsInCanvas({
      x: Math.min(from.x, to.x) - 12,
      y: Math.min(from.y, to.y) - 12,
      width: Math.abs(to.x - from.x) + 24,
      height: Math.abs(to.y - from.y) + 24,
    });

    const nextState = commitObject(state, {
      id: arrowId,
      kind: "arrow",
      from,
      to,
      fromId: input.fromId,
      toId: input.toId,
      label: input.label,
      bidirectional: input.bidirectional ?? false,
      bounds,
      style: {
        stroke: "#2563eb",
        fill: "#2563eb",
        strokeWidth: 2.5,
        ...input.style,
      },
    });

    state.objects = nextState.objects;
    state.revision = nextState.revision;

    return {
      arrowId,
      from,
      to,
      fromId: input.fromId,
      toId: input.toId,
      label: input.label,
    };
  },
};
