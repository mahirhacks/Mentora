import { removeObject } from "./boardState.js";
import type { BoardObject, BoardState, Bounds } from "./types.js";

const DEFAULT_OVERLAY_KINDS = new Set<BoardObject["kind"]>([
  "highlight",
  "pointer",
]);

export function boundsOverlap(
  a: Bounds,
  b: Bounds,
  padding = 0,
): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

export function clearOverlappingBeforePlace(
  state: BoardState,
  bounds: Bounds,
  options: {
    exceptIds?: string[];
    erasableKinds?: Set<BoardObject["kind"]>;
    padding?: number;
  } = {},
): string[] {
  const exceptIds = new Set(options.exceptIds ?? []);
  const erasableKinds = options.erasableKinds ?? DEFAULT_OVERLAY_KINDS;
  const padding = options.padding ?? 8;
  const erased: string[] = [];

  for (const [id, object] of Object.entries(state.objects)) {
    if (exceptIds.has(id)) {
      continue;
    }
    if (!erasableKinds.has(object.kind)) {
      continue;
    }
    if (!boundsOverlap(bounds, object.bounds, padding)) {
      continue;
    }

    const next = removeObject(state, id);
    state.objects = next.objects;
    state.revision = next.revision;
    erased.push(id);
  }

  return erased;
}
