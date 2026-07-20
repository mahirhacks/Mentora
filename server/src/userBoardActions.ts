import { randomUUID } from "node:crypto";
import {
  fitBoundsInCanvas,
  fitPointInCanvas,
} from "../tools/boundsGuard.js";
import type {
  BoardActivity,
  BoardObject,
  BoardState,
  Bounds,
  Point,
} from "../tools/types.js";

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

const MAX_ACTIVITY = 40;
const MAX_PENCIL_POINTS = 256;

function finitePoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") {
    return false;
  }
  const point = value as Point;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function boundsFromPoints(points: Point[], padding = 0): Bounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return fitBoundsInCanvas({
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  });
}

function appendActivity(
  state: BoardState,
  activity: Omit<BoardActivity, "id" | "actor" | "revision">,
) {
  const next: BoardActivity = {
    id: `activity_${randomUUID().slice(0, 8)}`,
    actor: "user",
    revision: state.revision,
    ...activity,
  };
  state.activity = [...(state.activity ?? []), next].slice(-MAX_ACTIVITY);
}

function userObject<T extends BoardObject>(object: T): T {
  return {
    ...object,
    createdBy: "user",
    updatedBy: "user",
  };
}

function commitUserObject(
  state: BoardState,
  object: BoardObject,
  activity: Omit<BoardActivity, "id" | "actor" | "revision">,
) {
  state.objects[object.id] = userObject(object);
  state.revision += 1;
  appendActivity(state, activity);
}

function requireDistance(from: Point, to: Point, minimum = 4) {
  if (Math.hypot(to.x - from.x, to.y - from.y) < minimum) {
    throw new Error("Drag farther to create this board object.");
  }
}

function applyShape(
  state: BoardState,
  action: Extract<UserBoardAction, { type: "shape" }>,
) {
  if (!["rectangle", "circle", "triangle"].includes(action.shape)) {
    throw new Error("Unsupported user shape.");
  }
  if (!finitePoint(action.from) || !finitePoint(action.to)) {
    throw new Error("Shape coordinates must be finite.");
  }
  const from = fitPointInCanvas(action.from);
  const to = fitPointInCanvas(action.to);
  requireDistance(from, to);

  const id = `user_shape_${randomUUID().slice(0, 8)}`;
  const minX = Math.min(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const width = Math.max(4, Math.abs(to.x - from.x));
  const height = Math.max(4, Math.abs(to.y - from.y));
  const style = {
    stroke: "#1f7a4d",
    fill: "rgba(31, 122, 77, 0.08)",
    strokeWidth: 3,
  };

  if (action.shape === "circle") {
    const size = Math.max(width, height);
    const bounds = fitBoundsInCanvas({
      x: to.x >= from.x ? from.x : from.x - size,
      y: to.y >= from.y ? from.y : from.y - size,
      width: size,
      height: size,
    });
    commitUserObject(
      state,
      {
        id,
        kind: "shape",
        shape: "ellipse",
        bounds,
        style,
      },
      {
        action: "create",
        objectIds: [id],
        summary: `drew a circle at (${bounds.x}, ${bounds.y})`,
      },
    );
    return;
  }

  const bounds = fitBoundsInCanvas({ x: minX, y: minY, width, height });
  if (action.shape === "triangle") {
    const points = [
      { x: bounds.x + bounds.width / 2, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    ];
    commitUserObject(
      state,
      {
        id,
        kind: "shape",
        shape: "polygon",
        bounds,
        points,
        style,
      },
      {
        action: "create",
        objectIds: [id],
        summary: `drew a triangle at (${bounds.x}, ${bounds.y})`,
      },
    );
    return;
  }

  commitUserObject(
    state,
    {
      id,
      kind: "shape",
      shape: "rectangle",
      bounds,
      style,
    },
    {
      action: "create",
      objectIds: [id],
      summary: `drew a rectangle at (${bounds.x}, ${bounds.y})`,
    },
  );
}

function applyPencil(
  state: BoardState,
  action: Extract<UserBoardAction, { type: "pencil" }>,
) {
  if (!Array.isArray(action.points)) {
    throw new Error("Pencil points are required.");
  }
  const points: Point[] = [];
  for (const rawPoint of action.points.slice(0, MAX_PENCIL_POINTS)) {
    if (!finitePoint(rawPoint)) {
      continue;
    }
    const point = fitPointInCanvas(rawPoint);
    const previous = points.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 2) {
      points.push(point);
    }
  }
  if (points.length < 2) {
    throw new Error("Draw a longer pencil stroke.");
  }

  const id = `user_stroke_${randomUUID().slice(0, 8)}`;
  commitUserObject(
    state,
    {
      id,
      kind: "shape",
      shape: "line",
      bounds: boundsFromPoints(points, 3),
      points,
      style: {
        stroke: "#1f7a4d",
        fill: "rgba(0, 0, 0, 0)",
        strokeWidth: 3,
      },
    },
    {
      action: "draw",
      objectIds: [id],
      summary: `drew a freehand stroke with ${points.length} points`,
    },
  );
}

function applyArrow(
  state: BoardState,
  action: Extract<UserBoardAction, { type: "arrow" }>,
) {
  if (!finitePoint(action.from) || !finitePoint(action.to)) {
    throw new Error("Arrow coordinates must be finite.");
  }
  const from = fitPointInCanvas(action.from);
  const to = fitPointInCanvas(action.to);
  requireDistance(from, to, 8);
  const id = `user_arrow_${randomUUID().slice(0, 8)}`;

  commitUserObject(
    state,
    {
      id,
      kind: "arrow",
      from,
      to,
      bounds: boundsFromPoints([from, to], 12),
      style: {
        stroke: "#1f7a4d",
        fill: "#1f7a4d",
        strokeWidth: 3,
      },
    },
    {
      action: "arrow",
      objectIds: [id],
      summary: `drew an arrow from (${from.x}, ${from.y}) to (${to.x}, ${to.y})`,
    },
  );
}

function applyPoint(
  state: BoardState,
  action: Extract<UserBoardAction, { type: "point" }>,
) {
  if (!finitePoint(action.at)) {
    throw new Error("Pointer coordinates must be finite.");
  }
  if (action.targetId && !state.objects[action.targetId]) {
    throw new Error(`Object not found: ${action.targetId}`);
  }
  const tip = fitPointInCanvas(action.at);
  const id = `user_pointer_${randomUUID().slice(0, 8)}`;
  commitUserObject(
    state,
    {
      id,
      kind: "pointer",
      targetId: action.targetId,
      tip,
      bounds: fitBoundsInCanvas({
        x: tip.x - 10,
        y: tip.y - 10,
        width: 20,
        height: 20,
      }),
      style: {
        stroke: "#1f7a4d",
        fill: "#1f7a4d",
        strokeWidth: 2,
      },
    },
    {
      action: "point",
      objectIds: [id, action.targetId].filter(
        (value): value is string => Boolean(value),
      ),
      summary: action.targetId
        ? `pointed at ${action.targetId}`
        : `placed a pointer at (${tip.x}, ${tip.y})`,
    },
  );
}

function translateObject(object: BoardObject, dx: number, dy: number) {
  object.bounds = {
    ...object.bounds,
    x: object.bounds.x + dx,
    y: object.bounds.y + dy,
  };
  object.updatedBy = "user";

  if (object.kind === "shape" && object.points) {
    object.points = object.points.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    }));
  } else if (object.kind === "pointer") {
    object.tip = { x: object.tip.x + dx, y: object.tip.y + dy };
  } else if (object.kind === "arrow") {
    object.from = { x: object.from.x + dx, y: object.from.y + dy };
    object.to = { x: object.to.x + dx, y: object.to.y + dy };
  }
}

function applyMove(
  state: BoardState,
  action: Extract<UserBoardAction, { type: "move" }>,
) {
  const selected = state.objects[action.objectId];
  if (!selected) {
    throw new Error(`Object not found: ${action.objectId}`);
  }
  if (!Number.isFinite(action.dx) || !Number.isFinite(action.dy)) {
    throw new Error("Move delta must be finite.");
  }

  const fitted = fitBoundsInCanvas({
    ...selected.bounds,
    x: selected.bounds.x + action.dx,
    y: selected.bounds.y + action.dy,
  });
  const dx = fitted.x - selected.bounds.x;
  const dy = fitted.y - selected.bounds.y;
  if (dx === 0 && dy === 0) {
    return;
  }

  const moved = new Set<string>([selected.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of Object.values(state.objects)) {
      if (moved.has(object.id)) {
        continue;
      }
      const followsMovedObject =
        (object.kind === "label" && moved.has(object.anchorId)) ||
        (object.kind === "division" && moved.has(object.parentId)) ||
        (object.kind === "highlight" && moved.has(object.targetId)) ||
        (object.kind === "pointer" &&
          Boolean(object.targetId && moved.has(object.targetId)));
      if (followsMovedObject) {
        moved.add(object.id);
        changed = true;
      }
    }
  }

  for (const id of moved) {
    translateObject(state.objects[id], dx, dy);
  }

  for (const object of Object.values(state.objects)) {
    if (object.kind !== "arrow" || moved.has(object.id)) {
      continue;
    }
    let arrowChanged = false;
    if (object.fromId && moved.has(object.fromId)) {
      object.from = { x: object.from.x + dx, y: object.from.y + dy };
      arrowChanged = true;
    }
    if (object.toId && moved.has(object.toId)) {
      object.to = { x: object.to.x + dx, y: object.to.y + dy };
      arrowChanged = true;
    }
    if (arrowChanged) {
      object.bounds = boundsFromPoints([object.from, object.to], 12);
      object.updatedBy = "user";
      moved.add(object.id);
    }
  }

  state.revision += 1;
  appendActivity(state, {
    action: "move",
    objectIds: [...moved],
    summary: `moved ${action.objectId} by (${Math.round(dx)}, ${Math.round(dy)})`,
  });
}

function referencesObject(object: BoardObject, ids: Set<string>) {
  return (
    (object.kind === "label" && ids.has(object.anchorId)) ||
    (object.kind === "division" && ids.has(object.parentId)) ||
    (object.kind === "highlight" && ids.has(object.targetId)) ||
    (object.kind === "pointer" &&
      Boolean(object.targetId && ids.has(object.targetId))) ||
    (object.kind === "arrow" &&
      Boolean(
        (object.fromId && ids.has(object.fromId)) ||
          (object.toId && ids.has(object.toId)),
      ))
  );
}

function applyErase(
  state: BoardState,
  action: Extract<UserBoardAction, { type: "erase" }>,
) {
  if (!state.objects[action.objectId]) {
    throw new Error(`Object not found: ${action.objectId}`);
  }
  const removed = new Set<string>([action.objectId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of Object.values(state.objects)) {
      if (!removed.has(object.id) && referencesObject(object, removed)) {
        removed.add(object.id);
        changed = true;
      }
    }
  }
  for (const id of removed) {
    delete state.objects[id];
  }
  state.revision += 1;
  appendActivity(state, {
    action: "erase",
    objectIds: [...removed],
    summary: `erased ${action.objectId}${
      removed.size > 1 ? ` and ${removed.size - 1} dependent object(s)` : ""
    }`,
  });
}

export function applyUserBoardAction(
  boardState: BoardState,
  action: UserBoardAction,
): BoardState {
  const state = structuredClone(boardState);
  state.activity ??= [];

  switch (action.type) {
    case "shape":
      applyShape(state, action);
      break;
    case "pencil":
      applyPencil(state, action);
      break;
    case "arrow":
      applyArrow(state, action);
      break;
    case "point":
      applyPoint(state, action);
      break;
    case "move":
      applyMove(state, action);
      break;
    case "erase":
      applyErase(state, action);
      break;
    default:
      throw new Error("Unsupported board action.");
  }

  return state;
}
