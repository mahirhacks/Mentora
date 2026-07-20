import {
  buildBoardLayoutCatalog,
  formatBoardLayoutForPrompt,
} from "../tools/boardLayout.js";
import type { BoardObject, BoardState } from "../tools/types.js";
import type { VerifiedBoardObservation } from "./types.js";

function summarizeObject(object: BoardObject): string {
  if (object.kind === "text" || object.kind === "label") {
    return object.text;
  }
  if (object.kind === "shape") {
    return object.label ? `${object.shape}: ${object.label}` : object.shape;
  }
  if (object.kind === "division") {
    return `region ${object.regionIndex + 1}`;
  }
  if (object.kind === "highlight") {
    return `highlight on ${object.targetId}`;
  }
  if (object.kind === "pointer") {
    return object.label ? `pointer: ${object.label}` : "pointer";
  }
  return String((object as BoardObject).kind);
}

function inferRelationships(
  boardState: BoardState,
  objectIds: string[],
): string[] {
  const relationships: string[] = [];
  const selected = objectIds
    .map((id) => boardState.objects[id])
    .filter((object): object is BoardObject => !!object);

  for (const object of selected) {
    if (object.kind === "label" && object.anchorId) {
      const anchor = boardState.objects[object.anchorId];
      if (anchor) {
        relationships.push(
          `${object.text} labels ${object.anchorId} (${summarizeObject(anchor)})`,
        );
      }
    }

    if (object.kind === "highlight" && object.targetId) {
      const target = boardState.objects[object.targetId];
      if (target) {
        relationships.push(
          `${object.id} highlights ${object.targetId} (${summarizeObject(target)})`,
        );
      }
    }

    if (object.kind === "pointer" && object.targetId) {
      const target = boardState.objects[object.targetId];
      if (target) {
        relationships.push(
          `${object.id} points at ${object.targetId} (${summarizeObject(target)})`,
        );
      }
    }
  }

  const labels = selected.filter(
    (object) => object.kind === "label" || object.kind === "text",
  );
  const shapes = selected.filter((object) => object.kind === "shape");

  for (const label of labels) {
    for (const shape of shapes) {
      const labelCenterX = label.bounds.x + label.bounds.width / 2;
      const labelCenterY = label.bounds.y + label.bounds.height / 2;
      const insideShape =
        labelCenterX >= shape.bounds.x &&
        labelCenterX <= shape.bounds.x + shape.bounds.width &&
        labelCenterY >= shape.bounds.y &&
        labelCenterY <= shape.bounds.y + shape.bounds.height;

      if (insideShape) {
        relationships.push(
          `${summarizeObject(label)} is inside ${shape.id} (${summarizeObject(shape)})`,
        );
      }
    }
  }

  return [...new Set(relationships)];
}

/**
 * Builds a verified observation from actual board state after tool execution.
 * The voice layer may only refer to objects present in this snapshot.
 */
export function buildVerifiedObservation(
  boardState: BoardState,
  boardObjectIds: string[] = [],
): VerifiedBoardObservation {
  const catalog = buildBoardLayoutCatalog(boardState);
  const requestedIds =
    boardObjectIds.length > 0
      ? boardObjectIds
      : catalog.map((entry) => entry.id);

  const objects: VerifiedBoardObservation["objects"] = {};

  for (const id of requestedIds) {
    const entry = catalog.find((item) => item.id === id);
    const object = boardState.objects[id];
    if (!entry || !object) {
      continue;
    }

    objects[id] = {
      id,
      kind: entry.kind,
      summary: entry.summary,
      region: entry.region,
    };
  }

  return {
    objects,
    relationships: inferRelationships(boardState, Object.keys(objects)),
    layoutSummary: formatBoardLayoutForPrompt(boardState),
  };
}
