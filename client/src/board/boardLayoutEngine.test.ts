import { describe, expect, it } from "vitest";
import { BoardObjectRegistry } from "./ObjectRegistry";
import {
  buildZonePlacement,
  eraseActionsForZone,
  normalizeBoardActions,
  wrapTextToWidth,
} from "./boardLayoutEngine";

describe("boardLayoutEngine", () => {
  it("wraps long text instead of overflowing", () => {
    const wrapped = wrapTextToWidth(
      "Supply and demand: prices and quantities are shaped by what buyers want and sellers offer.",
      20,
      400,
    );
    expect(wrapped).toContain("\n");
    for (const line of wrapped.split("\n")) {
      expect(line.length * 20 * 0.56).toBeLessThanOrEqual(420);
    }
  });

  it("clamps freehand write_text onto the safe canvas", () => {
    const [action] = normalizeBoardActions([
      {
        type: "write_text",
        objectId: "overflow",
        x: 900,
        y: 100,
        text: "Equilibrium: the price where what buyers want equals what sellers offer at that moment.",
        fontSize: 22,
      },
    ]);
    expect(action?.type).toBe("write_text");
    if (action?.type !== "write_text") return;
    expect(action.x + action.text.split("\n")[0]!.length * 22 * 0.56).toBeLessThanOrEqual(
      1100 - 40 + 8,
    );
    expect(action.y).toBeGreaterThanOrEqual(40);
    expect(action.text).toContain("\n");
  });

  it("fits callout boxes to wrapped text inside a zone", () => {
    const actions = buildZonePlacement({
      zone: "right",
      blocks: [
        {
          kind: "callout",
          text: "Equilibrium: the price where what buyers want equals what sellers offer.",
          objectId: "eq",
        },
      ],
    });
    const box = actions.find((a) => a.type === "draw_rectangle");
    const text = actions.find((a) => a.type === "write_text");
    expect(box?.type).toBe("draw_rectangle");
    expect(text?.type).toBe("write_text");
    if (box?.type !== "draw_rectangle" || text?.type !== "write_text") return;
    expect(box.x + box.width).toBeLessThanOrEqual(1040);
    expect(text.x).toBeGreaterThanOrEqual(box.x);
    expect(text.y).toBeGreaterThanOrEqual(box.y);
  });

  it("stacks title + bullets without leaving the zone", () => {
    const actions = buildZonePlacement({
      zone: "right",
      blocks: [
        { kind: "heading", text: "Supply and demand", objectId: "h1" },
        {
          kind: "bullets",
          lines: [
            "Demand: as price rises, people usually buy less.",
            "Supply: as price rises, sellers usually offer more.",
          ],
          objectIdPrefix: "b",
        },
      ],
    });
    expect(actions.length).toBeGreaterThanOrEqual(3);
    for (const a of actions) {
      if (a.type === "write_text") {
        expect(a.x).toBeGreaterThanOrEqual(560);
        expect(a.x).toBeLessThan(1040);
        expect(a.y).toBeLessThan(520);
      }
    }
  });

  it("eraseActionsForZone targets overlapping objects", () => {
    const registry = new BoardObjectRegistry();
    registry.add({
      id: "old",
      type: "text",
      x: 580,
      y: 140,
      text: "old",
      fontSize: 20,
      visible: true,
      layer: "ai",
    });
    registry.add({
      id: "keep",
      type: "text",
      x: 80,
      y: 140,
      text: "keep",
      fontSize: 20,
      visible: true,
      layer: "ai",
    });
    const erases = eraseActionsForZone(registry, "right");
    expect(erases.map((e) => (e.type === "erase_object" ? e.objectId : ""))).toEqual([
      "old",
    ]);
  });
});
