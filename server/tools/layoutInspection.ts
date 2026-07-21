import { boundsOverlap } from "./placementGuard.js";
import type { BoardObject, BoardState, Bounds } from "./types.js";

export interface LayoutIssue {
  code: "educational_object_erased" | "visual_collision";
  objectIds: string[];
  message: string;
}

const NON_BLOCKING_KINDS = new Set<BoardObject["kind"]>([
  "highlight",
  "pointer",
  "arrow",
]);

function isGhostText(object: BoardObject) {
  return object.kind === "text" && object.ghost === true;
}

function contains(outer: Bounds, inner: Bounds, tolerance = 2) {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

function isIntentionalRelationship(a: BoardObject, b: BoardObject) {
  if (NON_BLOCKING_KINDS.has(a.kind) || NON_BLOCKING_KINDS.has(b.kind)) {
    return true;
  }

  if (a.kind === "division" && a.parentId === b.id) {
    return true;
  }
  if (b.kind === "division" && b.parentId === a.id) {
    return true;
  }
  if (
    a.kind === "division" &&
    b.kind === "division" &&
    a.parentId === b.parentId
  ) {
    return true;
  }
  if (a.kind === "label" && a.anchorId === b.id) {
    return true;
  }
  if (b.kind === "label" && b.anchorId === a.id) {
    return true;
  }
  if (
    a.kind === "arrow" &&
    (a.fromId === b.id || a.toId === b.id)
  ) {
    return true;
  }
  if (
    b.kind === "arrow" &&
    (b.fromId === a.id || b.toId === a.id)
  ) {
    return true;
  }

  if (
    a.kind === "shape" &&
    (a.shape === "line" || contains(a.bounds, b.bounds))
  ) {
    return true;
  }
  if (
    b.kind === "shape" &&
    (b.shape === "line" || contains(b.bounds, a.bounds))
  ) {
    return true;
  }

  if (a.kind === "division" && contains(a.bounds, b.bounds)) {
    return true;
  }
  if (b.kind === "division" && contains(b.bounds, a.bounds)) {
    return true;
  }

  if (
    a.kind === "text" &&
    b.kind === "text" &&
    a.groupId &&
    a.groupId === b.groupId
  ) {
    return true;
  }

  // Ghost group boxes are reference-only and span the whole snippet; they must
  // not fail turns by colliding with nearby notes or later drawings.
  if (isGhostText(a) || isGhostText(b)) {
    return true;
  }

  return false;
}

function changedObjectIds(before: BoardState, after: BoardState) {
  const changed = new Set<string>();
  for (const [id, object] of Object.entries(after.objects)) {
    const previous = before.objects[id];
    if (!previous || JSON.stringify(previous) !== JSON.stringify(object)) {
      changed.add(id);
    }
  }
  return changed;
}

export function inspectBoardEdit(
  before: BoardState,
  after: BoardState,
  options: { allowEducationalErasure?: boolean } = {},
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const changedIds = changedObjectIds(before, after);

  for (const [id, object] of Object.entries(before.objects)) {
    if (
      !options.allowEducationalErasure &&
      !after.objects[id] &&
      (object.kind === "text" || object.kind === "label")
    ) {
      issues.push({
        code: "educational_object_erased",
        objectIds: [id],
        message: `Board edit erased educational ${object.kind} "${id}". Erase it explicitly only when it is obsolete.`,
      });
    }
  }

  const objects = Object.values(after.objects);
  const seenPairs = new Set<string>();

  for (const changedId of changedIds) {
    const changed = after.objects[changedId];
    if (
      !changed ||
      NON_BLOCKING_KINDS.has(changed.kind) ||
      isGhostText(changed)
    ) {
      continue;
    }

    for (const other of objects) {
      if (other.id === changed.id || isGhostText(other)) {
        continue;
      }
      const pair = [changed.id, other.id].sort().join("::");
      if (seenPairs.has(pair)) {
        continue;
      }
      seenPairs.add(pair);

      if (!boundsOverlap(changed.bounds, other.bounds, 4)) {
        continue;
      }
      if (isIntentionalRelationship(changed, other)) {
        continue;
      }

      issues.push({
        code: "visual_collision",
        objectIds: [changed.id, other.id],
        message: `Board objects "${changed.id}" and "${other.id}" overlap without an intentional containment or reference. Move or resize one of them.`,
      });
    }
  }

  return issues;
}
