import type { BoardObjectType } from "@mentora/shared";

export type BoardObject = {
  id: string;
  type: BoardObjectType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: number[];
  text?: string;
  latex?: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  fontSize?: number;
  visible: boolean;
  layer: "ai";
};

function distPointToSeg(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distPointToRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const cx = Math.max(x, Math.min(px, x + w));
  const cy = Math.max(y, Math.min(py, y + h));
  return Math.hypot(px - cx, py - cy);
}

export class BoardObjectRegistry {
  private objects = new Map<string, BoardObject>();

  has(id: string): boolean {
    return this.objects.has(id);
  }

  get(id: string): BoardObject | undefined {
    return this.objects.get(id);
  }

  listIds(): string[] {
    return [...this.objects.keys()];
  }

  list(): BoardObject[] {
    return [...this.objects.values()];
  }

  add(object: BoardObject): void {
    if (this.objects.has(object.id)) {
      throw new Error(`DUPLICATE_ID:${object.id}`);
    }
    this.objects.set(object.id, object);
  }

  update(id: string, patch: Partial<BoardObject>): BoardObject {
    const current = this.objects.get(id);
    if (!current) {
      throw new Error(`OBJECT_NOT_FOUND:${id}`);
    }
    const next = { ...current, ...patch, id };
    this.objects.set(id, next);
    return next;
  }

  erase(id: string): void {
    if (!this.objects.delete(id)) {
      throw new Error(`OBJECT_NOT_FOUND:${id}`);
    }
  }

  clear(): void {
    this.objects.clear();
  }

  centerOf(id: string): { x: number; y: number } {
    const obj = this.objects.get(id);
    if (!obj) throw new Error(`OBJECT_NOT_FOUND:${id}`);
    if (obj.type === "circle") {
      return { x: obj.x, y: obj.y };
    }
    if (obj.points && obj.points.length >= 4) {
      const xs = obj.points.filter((_, i) => i % 2 === 0);
      const ys = obj.points.filter((_, i) => i % 2 === 1);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    }
    return {
      x: obj.x + (obj.width ?? 0) / 2,
      y: obj.y + (obj.height ?? 40) / 2,
    };
  }

  nearestIds(x: number, y: number, limit = 3): string[] {
    return this.list()
      .map((obj) => {
        const c = this.centerOf(obj.id);
        const dist = Math.hypot(c.x - x, c.y - y);
        return { id: obj.id, dist };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit)
      .map((row) => row.id);
  }

  /** True if any part of the object lies inside the eraser circle. */
  hitsCircle(obj: BoardObject, x: number, y: number, radius: number): boolean {
    if (!obj.visible) return false;

    if (obj.type === "circle") {
      const d = Math.hypot(obj.x - x, obj.y - y);
      return d <= radius + (obj.radius ?? 0);
    }

    if (obj.type === "rectangle") {
      return (
        distPointToRect(x, y, obj.x, obj.y, obj.width ?? 0, obj.height ?? 0) <=
        radius
      );
    }

    if (
      (obj.type === "line" || obj.type === "arrow") &&
      obj.points &&
      obj.points.length >= 4
    ) {
      for (let i = 0; i + 3 < obj.points.length; i += 2) {
        const d = distPointToSeg(
          x,
          y,
          obj.points[i]!,
          obj.points[i + 1]!,
          obj.points[i + 2]!,
          obj.points[i + 3]!,
        );
        if (d <= radius + (obj.strokeWidth ?? 2) / 2) return true;
      }
      return false;
    }

    // text / equation / label — approximate glyph box
    const fs = obj.fontSize ?? 22;
    const label = obj.text ?? obj.latex ?? "";
    const w = Math.max(fs, label.length * fs * 0.55);
    const h = fs * 1.25;
    return distPointToRect(x, y, obj.x, obj.y, w, h) <= radius;
  }

  idsHittingCircle(x: number, y: number, radius: number): string[] {
    return this.list()
      .filter((obj) => this.hitsCircle(obj, x, y, radius))
      .map((obj) => obj.id);
  }
}
