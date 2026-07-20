import { describe, expect, it } from "vitest";
import {
  BoardDiagramArgsSchema,
  compileDiagramOps,
  squareFormulaBoardActions,
  squareFormulaDiagramOps,
} from "./diagramLayout.js";
import { LessonPlanSchema, fallbackSquareLesson } from "./index.js";

describe("compileDiagramOps", () => {
  it("builds a 2x2 square without the model supplying coordinates", () => {
    const { actions, boxes } = compileDiagramOps(squareFormulaDiagramOps());
    expect(boxes.big_square).toBeTruthy();
    expect(boxes.region_a2).toBeTruthy();
    expect(boxes.region_b2).toBeTruthy();

    const rect = actions.find((a) => a.type === "draw_rectangle");
    expect(rect?.type).toBe("draw_rectangle");
    if (rect?.type !== "draw_rectangle") return;
    expect(rect.x).toBeGreaterThanOrEqual(40);
    expect(rect.y).toBeGreaterThanOrEqual(40);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1060);
    expect(rect.y + rect.height).toBeLessThanOrEqual(580);

    const eqs = actions.filter((a) => a.type === "write_equation");
    expect(eqs.length).toBeGreaterThanOrEqual(4);

    const point = actions.find((a) => a.type === "point_at");
    expect(point).toMatchObject({ type: "point_at", objectId: "region_ab1" });
  });

  it("rejects unknown parents instead of guessing pixels", () => {
    expect(() =>
      compileDiagramOps([
        {
          op: "divide_region",
          parentId: "missing",
          layout: "2x2-grid",
          cells: [{ id: "c1", label: "A" }],
        },
      ]),
    ).toThrow(/DIAGRAM_UNKNOWN_PARENT:missing/);
  });

  it("validates board_diagram args", () => {
    const ok = BoardDiagramArgsSchema.safeParse({
      ops: [
        {
          op: "create_shape",
          objectId: "box1",
          shape: "rectangle",
          region: "left",
          size: "md",
        },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("squareFormulaBoardActions stays on-canvas", () => {
    for (const a of squareFormulaBoardActions()) {
      if (a.type === "draw_rectangle") {
        expect(a.x + a.width).toBeLessThanOrEqual(1100);
        expect(a.y + a.height).toBeLessThanOrEqual(620);
      }
    }
  });
});

describe("fallbackSquareLesson (declarative)", () => {
  it("still parses as LessonPlan", () => {
    const parsed = LessonPlanSchema.parse(fallbackSquareLesson);
    expect(parsed.steps[0]?.boardPlan.length).toBeGreaterThan(0);
    expect(parsed.steps[1]?.boardPlan.some((a) => a.type === "draw_line")).toBe(
      true,
    );
  });
});
