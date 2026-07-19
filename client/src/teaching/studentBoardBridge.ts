import type { StudentBoardUpdate, StudentStroke } from "@mentora/shared";
import type { BoardObjectRegistry } from "../board/ObjectRegistry";

export function buildStudentBoardUpdate(
  strokes: StudentStroke[],
  registry: BoardObjectRegistry,
  intentHint: StudentBoardUpdate["intentHint"] = "showing_idea",
): StudentBoardUpdate {
  const ids = strokes.map((s) => s.id);
  const allPoints = strokes.flatMap((s) => s.points);
  let bounds: StudentBoardUpdate["bounds"];
  let nearestObjectIds: string[] = [];

  if (allPoints.length >= 2) {
    const xs = allPoints.filter((_, i) => i % 2 === 0);
    const ys = allPoints.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    bounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
    nearestObjectIds = registry.nearestIds(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      3,
    );
  }

  return {
    strokeIds: ids,
    strokeCount: strokes.length,
    bounds,
    nearestObjectIds,
    intentHint,
    timestamp: Date.now(),
  };
}
