import { create } from "zustand";
import type { StudentStroke } from "@mentora/shared";
import type { BoardObject } from "../board/ObjectRegistry";
import type { FocusState } from "../board/ActionExecutor";

export type BoardTool =
  | "pointer"
  | "pen"
  | "eraser"
  | "shapes"
  | "text"
  | "equation";

export const ERASER_RADIUS = 22;

type BoardStore = {
  objects: BoardObject[];
  studentStrokes: StudentStroke[];
  studentPlacedIds: string[];
  focus: FocusState;
  studentBoardActive: boolean;
  tool: BoardTool;
  setObjects: (objects: BoardObject[]) => void;
  setFocus: (focus: FocusState) => void;
  setTool: (tool: BoardTool) => void;
  setStudentBoardActive: (active: boolean) => void;
  addStudentStroke: (stroke: StudentStroke) => void;
  undoLastStroke: () => StudentStroke | null;
  clearStudentStrokes: () => void;
  /** Remove only ink points inside the eraser circle; keep the rest. */
  eraseStudentNear: (x: number, y: number, radius?: number) => void;
  pushStudentPlaced: (objectId: string) => void;
  popStudentPlaced: () => string | null;
  removeStudentPlacedIds: (ids: string[]) => void;
  clearStudentPlaced: () => void;
};

let strokeSeq = 0;

function clipStrokePoints(
  points: number[],
  x: number,
  y: number,
  radius: number,
): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const px = points[i]!;
    const py = points[i + 1]!;
    if (Math.hypot(px - x, py - y) > radius) {
      current.push(px, py);
    } else if (current.length >= 4) {
      segments.push(current);
      current = [];
    } else {
      current = [];
    }
  }
  if (current.length >= 4) segments.push(current);
  return segments;
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  objects: [],
  studentStrokes: [],
  studentPlacedIds: [],
  focus: { kind: null, objectId: null, x: null, y: null, until: 0 },
  studentBoardActive: false,
  tool: "pen",
  setObjects: (objects) => set({ objects }),
  setFocus: (focus) => set({ focus }),
  setTool: (tool) => set({ tool }),
  setStudentBoardActive: (studentBoardActive) => set({ studentBoardActive }),
  addStudentStroke: (stroke) =>
    set({ studentStrokes: [...get().studentStrokes, stroke] }),
  undoLastStroke: () => {
    const strokes = get().studentStrokes;
    if (!strokes.length) return null;
    const last = strokes[strokes.length - 1]!;
    set({ studentStrokes: strokes.slice(0, -1) });
    return last;
  },
  clearStudentStrokes: () => set({ studentStrokes: [] }),
  eraseStudentNear: (x, y, radius = ERASER_RADIUS) => {
    const next: StudentStroke[] = [];
    for (const stroke of get().studentStrokes) {
      const segments = clipStrokePoints(stroke.points, x, y, radius);
      if (segments.length === 0) continue;
      if (
        segments.length === 1 &&
        segments[0]!.length === stroke.points.length
      ) {
        next.push(stroke);
        continue;
      }
      for (const points of segments) {
        strokeSeq += 1;
        const xs = points.filter((_, i) => i % 2 === 0);
        const ys = points.filter((_, i) => i % 2 === 1);
        next.push({
          ...stroke,
          id: `${stroke.id}_e${strokeSeq}`,
          points,
          bounds: {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          },
        });
      }
    }
    set({ studentStrokes: next });
  },
  pushStudentPlaced: (objectId) =>
    set({ studentPlacedIds: [...get().studentPlacedIds, objectId] }),
  popStudentPlaced: () => {
    const ids = get().studentPlacedIds;
    if (!ids.length) return null;
    const last = ids[ids.length - 1]!;
    set({ studentPlacedIds: ids.slice(0, -1) });
    return last;
  },
  removeStudentPlacedIds: (ids) => {
    if (!ids.length) return;
    const drop = new Set(ids);
    set({
      studentPlacedIds: get().studentPlacedIds.filter((id) => !drop.has(id)),
    });
  },
  clearStudentPlaced: () => set({ studentPlacedIds: [] }),
}));
