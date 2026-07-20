import type { SemanticBoardObject } from "@mentora/shared";
import type { BoardObject } from "./ObjectRegistry";

function guessRelationship(obj: BoardObject, all: BoardObject[]): string {
  if (obj.id.startsWith("region_")) return "part_of_diagram";
  if (obj.id.includes("split")) return "guide_line";
  if (obj.type === "text" || obj.type === "equation") {
    const near = all.find(
      (o) =>
        o.type === "rectangle" &&
        o.id !== obj.id &&
        Math.abs((o.x ?? 0) - obj.x) < 200 &&
        Math.abs((o.y ?? 0) - obj.y) < 200,
    );
    if (near) return `label_for_${near.id}`;
  }
  if (obj.type === "rectangle" && obj.id.includes("square")) {
    return "main_diagram";
  }
  return "";
}

/** Compact semantic board for Decision API + voice instructions (no pixels). */
export function buildSemanticBoard(objects: BoardObject[]): SemanticBoardObject[] {
  return objects
    .filter((o) => o.visible !== false)
    .map((o) => ({
      id: o.id,
      type: o.type,
      label: (o.text ?? o.latex ?? o.id).slice(0, 120),
      author: o.layer === "student" ? ("student" as const) : ("ai" as const),
      relationship: guessRelationship(o, objects).slice(0, 80),
    }));
}

export function formatSemanticBoardForVoice(
  objects: SemanticBoardObject[],
): string {
  if (!objects.length) return "(empty board)";
  return objects
    .map(
      (o) =>
        `${o.id}: ${o.type} "${o.label}" [${o.author}]${o.relationship ? ` (${o.relationship})` : ""}`,
    )
    .join("; ");
}
