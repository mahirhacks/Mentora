import { useBoardStore } from "../state/boardStore";
import type { BoardObjectRegistry } from "./ObjectRegistry";
import { snapshotBoardForModel } from "./boardSpatialMap";

/** Always read live registry + ink for the model. */
export function liveBoardSnapshot(registry: BoardObjectRegistry) {
  const strokes = useBoardStore.getState().studentStrokes;
  return snapshotBoardForModel(registry, strokes);
}
