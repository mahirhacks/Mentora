import { SAFE_ZONE } from "./boardLayout.js";
import type { BoardObject, BoardState, Bounds, Point } from "./types.js";

function isFiniteBounds(bounds: Bounds) {
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(
    Number.isFinite,
  );
}

function boundsInsideSafeZone(bounds: Bounds) {
  return (
    bounds.x >= SAFE_ZONE.x &&
    bounds.y >= SAFE_ZONE.y &&
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.x + bounds.width <= SAFE_ZONE.x + SAFE_ZONE.width &&
    bounds.y + bounds.height <= SAFE_ZONE.y + SAFE_ZONE.height
  );
}

function pointInsideSafeZone(point: Point) {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= SAFE_ZONE.x &&
    point.x <= SAFE_ZONE.x + SAFE_ZONE.width &&
    point.y >= SAFE_ZONE.y &&
    point.y <= SAFE_ZONE.y + SAFE_ZONE.height
  );
}

function referencedObjectIds(object: BoardObject): string[] {
  switch (object.kind) {
    case "label":
      return [object.anchorId];
    case "division":
      return [object.parentId];
    case "highlight":
      return [object.targetId];
    case "pointer":
      return object.targetId ? [object.targetId] : [];
    case "arrow":
      return [object.fromId, object.toId].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      );
    default:
      return [];
  }
}

export function assertBoardPostconditions(
  state: BoardState,
): { ok: true } | { ok: false; error: string } {
  for (const object of Object.values(state.objects)) {
    if (!isFiniteBounds(object.bounds)) {
      return {
        ok: false,
        error: `Object ${object.id} has non-finite bounds.`,
      };
    }

    if (!boundsInsideSafeZone(object.bounds)) {
      return {
        ok: false,
        error: `Object ${object.id} is outside the board safe zone.`,
      };
    }

    if (
      object.kind === "shape" &&
      object.points?.some((point) => !pointInsideSafeZone(point))
    ) {
      return {
        ok: false,
        error: `Shape ${object.id} has points outside the board safe zone.`,
      };
    }

    if (
      object.kind === "arrow" &&
      (!pointInsideSafeZone(object.from) || !pointInsideSafeZone(object.to))
    ) {
      return {
        ok: false,
        error: `Arrow ${object.id} has endpoints outside the board safe zone.`,
      };
    }

    for (const referenceId of referencedObjectIds(object)) {
      if (!state.objects[referenceId]) {
        return {
          ok: false,
          error: `Object ${object.id} references missing object ${referenceId}.`,
        };
      }
    }
  }

  return { ok: true };
}
