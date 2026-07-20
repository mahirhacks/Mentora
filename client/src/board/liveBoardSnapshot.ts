import { useBoardStore } from "../state/boardStore";
import { formatZonesForModel } from "./boardLayoutEngine";
import type { BoardObjectRegistry } from "./ObjectRegistry";
import { snapshotBoardForModel } from "./boardSpatialMap";

/** Always read live registry + ink for the model. */
export function liveBoardSnapshot(registry: BoardObjectRegistry) {
  const strokes = useBoardStore.getState().studentStrokes;
  const snap = snapshotBoardForModel(registry, strokes);
  return {
    map: snap.map,
    text: `${snap.text}\nlayout zones (prefer board_place for prose):\n${formatZonesForModel()}`,
  };
}
