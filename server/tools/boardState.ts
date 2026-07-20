import { randomUUID } from "node:crypto";
import type { BoardObject, BoardState, Bounds, Point } from "./types.js";

export function createBoardState(): BoardState {
  return { objects: {}, revision: 0, activity: [] };
}

export function cloneBoardState(state: BoardState): BoardState {
  return structuredClone(state);
}

export function nextObjectId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function commitObject(
  state: BoardState,
  object: BoardObject,
): BoardState {
  const existing = state.objects[object.id];
  return {
    revision: state.revision + 1,
    activity: state.activity ?? [],
    objects: {
      ...state.objects,
      [object.id]: {
        ...object,
        createdBy: object.createdBy ?? existing?.createdBy ?? "ai",
        updatedBy: object.updatedBy ?? "ai",
      },
    },
  };
}

export function removeObject(state: BoardState, objectId: string): BoardState {
  const { [objectId]: _removed, ...rest } = state.objects;
  return {
    revision: state.revision + 1,
    activity: state.activity ?? [],
    objects: rest,
  };
}

export function getObject(state: BoardState, objectId: string): BoardObject {
  const object = state.objects[objectId];
  if (!object) {
    throw new Error(`Object not found: ${objectId}`);
  }
  return object;
}

export function getBounds(object: BoardObject): Bounds {
  return object.bounds;
}

export function boundsCenter(bounds: Bounds): Point {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export function placeRelativeBounds(
  reference: Bounds,
  subject: Bounds,
  relation: "above" | "below" | "left" | "right" | "inside" | "center",
  offset = 12,
): Bounds {
  const refCenter = boundsCenter(reference);

  switch (relation) {
    case "above":
      return {
        x: refCenter.x - subject.width / 2,
        y: reference.y - subject.height - offset,
        width: subject.width,
        height: subject.height,
      };
    case "below":
      return {
        x: refCenter.x - subject.width / 2,
        y: reference.y + reference.height + offset,
        width: subject.width,
        height: subject.height,
      };
    case "left":
      return {
        x: reference.x - subject.width - offset,
        y: refCenter.y - subject.height / 2,
        width: subject.width,
        height: subject.height,
      };
    case "right":
      return {
        x: reference.x + reference.width + offset,
        y: refCenter.y - subject.height / 2,
        width: subject.width,
        height: subject.height,
      };
    case "inside":
    case "center":
      return {
        x: refCenter.x - subject.width / 2,
        y: refCenter.y - subject.height / 2,
        width: subject.width,
        height: subject.height,
      };
  }
}

export function splitBounds(
  bounds: Bounds,
  divisions: number,
  direction: "horizontal" | "vertical",
): Bounds[] {
  if (divisions < 1) {
    throw new Error("divisions must be at least 1");
  }

  const regions: Bounds[] = [];

  for (let index = 0; index < divisions; index += 1) {
    if (direction === "vertical") {
      const sliceWidth = bounds.width / divisions;
      regions.push({
        x: bounds.x + sliceWidth * index,
        y: bounds.y,
        width: sliceWidth,
        height: bounds.height,
      });
    } else {
      const sliceHeight = bounds.height / divisions;
      regions.push({
        x: bounds.x,
        y: bounds.y + sliceHeight * index,
        width: bounds.width,
        height: sliceHeight,
      });
    }
  }

  return regions;
}
