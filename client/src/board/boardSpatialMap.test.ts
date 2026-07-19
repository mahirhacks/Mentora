import { describe, expect, it } from "vitest";
import { BoardObjectRegistry } from "./ObjectRegistry";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  buildBoardSpatialMap,
  formatBoardSpatialMap,
} from "./boardSpatialMap";

describe("boardSpatialMap", () => {
  it("reports object pixel boxes and free slots on empty-ish board", () => {
    const registry = new BoardObjectRegistry();
    registry.add({
      id: "diagram",
      type: "rectangle",
      x: 60,
      y: 50,
      width: 300,
      height: 220,
      visible: true,
      layer: "ai",
    });
    registry.add({
      id: "title",
      type: "text",
      x: 520,
      y: 60,
      text: "Pythagorean theorem",
      fontSize: 24,
      visible: true,
      layer: "ai",
    });

    const map = buildBoardSpatialMap(registry, []);
    expect(map.canvas.width).toBe(BOARD_WIDTH);
    expect(map.canvas.height).toBe(BOARD_HEIGHT);
    expect(map.objects).toHaveLength(2);
    expect(map.objects[0]?.box).toEqual({ x: 60, y: 50, w: 300, h: 220 });
    expect(map.freeSlots.length).toBeGreaterThan(0);

    const text = formatBoardSpatialMap(map);
    expect(text).toContain("total pixels:");
    expect(text).toContain("px 60,50 to 360,270");
    expect(text).toContain("free slots");
  });

  it("flags overlapping objects", () => {
    const registry = new BoardObjectRegistry();
    registry.add({
      id: "a",
      type: "text",
      x: 100,
      y: 100,
      text: "Hello world",
      fontSize: 28,
      visible: true,
      layer: "ai",
    });
    registry.add({
      id: "b",
      type: "text",
      x: 110,
      y: 105,
      text: "Overlap",
      fontSize: 28,
      visible: true,
      layer: "ai",
    });
    const map = buildBoardSpatialMap(registry, []);
    expect(map.overlaps.length).toBeGreaterThan(0);
    expect(formatBoardSpatialMap(map)).toContain("OVERLAPS");
  });
});
