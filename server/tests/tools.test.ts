import { describe, expect, it } from "vitest";
import { SAFE_ZONE } from "../tools/boundsGuard.js";
import { createBoardState, runTool } from "../tools/index.js";

describe("board tool registry", () => {
  it("rejects unknown tools without mutating state", () => {
    const state = createBoardState();
    const outcome = runTool("not_a_tool", {}, state);

    expect(outcome.ok).toBe(false);
    expect(state).toEqual(createBoardState());
  });
});

describe("core board tools", () => {
  it("creates a shape inside the board", () => {
    const state = createBoardState();
    const outcome = runTool(
      "create_shape",
      {
        id: "fraction_bar",
        shape: "rectangle",
        x: 100,
        y: 120,
        width: 360,
        height: 72,
      },
      state,
    );

    expect(outcome.ok).toBe(true);
    expect(state.objects.fraction_bar).toMatchObject({
      id: "fraction_bar",
      kind: "shape",
      shape: "rectangle",
    });
  });

  it("divides an existing shape into equal regions", () => {
    const state = createBoardState();
    runTool(
      "create_shape",
      {
        id: "fraction_bar",
        shape: "rectangle",
        x: 100,
        y: 120,
        width: 360,
        height: 72,
      },
      state,
    );

    const outcome = runTool(
      "divide_region",
      {
        targetId: "fraction_bar",
        divisions: 4,
        direction: "vertical",
      },
      state,
    );

    expect(outcome.ok).toBe(true);
    const regions = Object.values(state.objects).filter(
      (object) => object.kind === "division",
    );
    expect(regions).toHaveLength(4);
    expect(regions.map((region) => region.bounds.width)).toEqual([
      90, 90, 90, 90,
    ]);
  });

  it("labels an existing object", () => {
    const state = createBoardState();
    runTool(
      "create_shape",
      {
        id: "variable_box",
        shape: "rectangle",
        x: 200,
        y: 150,
        width: 240,
        height: 120,
      },
      state,
    );

    const outcome = runTool(
      "label_in",
      { targetId: "variable_box", text: "24", position: "center" },
      state,
    );

    expect(outcome.ok).toBe(true);
    expect(
      Object.values(state.objects).some(
        (object) => object.kind === "label" && object.text === "24",
      ),
    ).toBe(true);
  });

  it("writes and clamps standalone text", () => {
    const state = createBoardState();
    const outcome = runTool(
      "write_text",
      { id: "equation", text: "7{s}+{s}5{s}={s}12", x: -500, y: -500 },
      state,
    );

    expect(outcome.ok).toBe(true);
    const equation = state.objects.equation;
    expect(equation).toBeDefined();
    expect(equation.bounds.x).toBeGreaterThanOrEqual(SAFE_ZONE.x);
    expect(equation.bounds.y).toBeGreaterThanOrEqual(SAFE_ZONE.y);
    expect(equation.ghost).toBe(true);
    expect(state.objects.equation_w0?.text).toBe("7");
    expect(state.objects.equation_w4?.text).toBe("12");
  });

  it("splits multi-line write_text into per-word objects across rows", () => {
    const state = createBoardState();
    const outcome = runTool(
      "write_text",
      {
        id: "lyrics",
        text: "fly{s}me{s}to{s}the{s}moon{n}let{s}me{s}see{s}mars",
        x: 120,
        y: 160,
      },
      state,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.wordIds.length).toBe(9);
    expect(outcome.result.text).toBe("fly me to the moon\nlet me see mars");
    expect(state.objects.lyrics?.ghost).toBe(true);
    expect(state.objects.lyrics_w0?.text).toBe("fly");
    expect(state.objects.lyrics_w4?.text).toBe("moon");
    expect(state.objects.lyrics_w5?.text).toBe("let");
    expect(state.objects.lyrics_w5.bounds.y).toBeGreaterThan(
      state.objects.lyrics_w0.bounds.y,
    );
  });

  it("highlights an existing object", () => {
    const state = createBoardState();
    runTool(
      "write_text",
      { id: "equation", text: "7 + 5 = 12", x: 400, y: 200 },
      state,
    );

    const outcome = runTool(
      "highlight",
      { targetId: "equation", padding: 8 },
      state,
    );

    expect(outcome.ok).toBe(true);
    expect(
      Object.values(state.objects).some(
        (object) =>
          object.kind === "highlight" && object.targetId === "equation",
      ),
    ).toBe(true);
    const highlight = Object.values(state.objects).find(
      (object) => object.kind === "highlight",
    );
    expect(highlight?.style?.fill).toBe("rgba(0, 0, 0, 0)");
  });

  it("makes a shape around existing content stroke-only", () => {
    const state = createBoardState();
    runTool(
      "write_text",
      { id: "target_text", text: "age = 24", x: 300, y: 220 },
      state,
    );

    const target = state.objects.target_text;
    const outcome = runTool(
      "create_shape",
      {
        id: "marker",
        shape: "rectangle",
        x: target.bounds.x - 12,
        y: target.bounds.y - 12,
        width: target.bounds.width + 24,
        height: target.bounds.height + 24,
        style: { stroke: "#f59e0b", fill: "#ffffff" },
      },
      state,
    );

    expect(outcome.ok).toBe(true);
    const marker = state.objects.marker;
    expect(marker.kind).toBe("shape");
    expect(marker.style?.fill).toBe("rgba(0, 0, 0, 0)");
  });

  it("points at an existing object", () => {
    const state = createBoardState();
    runTool(
      "create_shape",
      {
        id: "focus",
        shape: "ellipse",
        x: 400,
        y: 240,
        radius: 40,
      },
      state,
    );

    const outcome = runTool(
      "point_at",
      { targetId: "focus", label: "Look here" },
      state,
    );

    expect(outcome.ok).toBe(true);
    expect(
      Object.values(state.objects).some(
        (object) =>
          object.kind === "pointer" && object.targetId === "focus",
      ),
    ).toBe(true);
  });

  it("draws an arrow connecting two objects", () => {
    const state = createBoardState();
    runTool(
      "create_shape",
      {
        id: "left_box",
        shape: "rectangle",
        x: 120,
        y: 180,
        width: 140,
        height: 80,
      },
      state,
    );
    runTool(
      "create_shape",
      {
        id: "right_box",
        shape: "rectangle",
        x: 520,
        y: 180,
        width: 140,
        height: 80,
      },
      state,
    );

    const outcome = runTool(
      "arrow",
      {
        id: "flow_arrow",
        fromId: "left_box",
        toId: "right_box",
        label: "becomes",
      },
      state,
    );

    expect(outcome.ok).toBe(true);
    const arrow = state.objects.flow_arrow;
    expect(arrow.kind).toBe("arrow");
    if (arrow.kind !== "arrow") {
      throw new Error("Expected arrow object.");
    }
    expect(arrow.fromId).toBe("left_box");
    expect(arrow.toId).toBe("right_box");
    expect(arrow.from.x).toBeLessThan(arrow.to.x);
  });

  it("clamps relative placement into the safe zone", () => {
    const state = createBoardState();
    runTool(
      "create_shape",
      {
        id: "subject",
        shape: "rectangle",
        x: 100,
        y: 100,
        width: 40,
        height: 40,
      },
      state,
    );
    runTool(
      "create_shape",
      {
        id: "reference",
        shape: "rectangle",
        x: 120,
        y: 100,
        width: 40,
        height: 40,
      },
      state,
    );

    const outcome = runTool(
      "place_relative",
      {
        objectId: "subject",
        referenceId: "reference",
        relation: "left",
        offset: 400,
      },
      state,
    );

    expect(outcome.ok).toBe(true);
    expect(state.objects.subject.bounds.x).toBe(SAFE_ZONE.x);
  });

  it("transforms polygon points when fitting the polygon", () => {
    const state = createBoardState();
    const outcome = runTool(
      "create_shape",
      {
        id: "triangle",
        shape: "polygon",
        x: -100,
        y: -100,
        points: [
          { x: -100, y: -100 },
          { x: 100, y: -100 },
          { x: -100, y: 100 },
        ],
      },
      state,
    );

    expect(outcome.ok).toBe(true);
    const triangle = state.objects.triangle;
    expect(triangle.kind).toBe("shape");
    if (triangle.kind !== "shape") {
      throw new Error("Expected triangle shape.");
    }
    expect(triangle.points).toBeDefined();
    for (const point of triangle.points ?? []) {
      expect(point.x).toBeGreaterThanOrEqual(SAFE_ZONE.x);
      expect(point.y).toBeGreaterThanOrEqual(SAFE_ZONE.y);
    }
  });

  it("rejects invalid input without mutating state", () => {
    const state = createBoardState();
    const before = structuredClone(state);

    const outcome = runTool(
      "create_shape",
      {
        id: "invalid",
        shape: "polygon",
        x: 100,
        y: 100,
        points: [{ x: 100, y: 100 }],
      },
      state,
    );

    expect(outcome.ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("erases and resets objects deterministically", () => {
    const state = createBoardState();
    runTool(
      "write_text",
      { id: "temporary", text: "temporary", x: 200, y: 200 },
      state,
    );

    expect(
      runTool("erase_object", { objectId: "temporary" }, state).ok,
    ).toBe(true);
    expect(state.objects.temporary).toBeUndefined();

    runTool(
      "write_text",
      { id: "another", text: "another", x: 300, y: 300 },
      state,
    );
    expect(runTool("reset_board", {}, state).ok).toBe(true);
    expect(state.objects).toEqual({});
  });

  it("protects student-created work from erase_object but reset_board clears all", () => {
    const state = createBoardState();
    runTool(
      "create_shape",
      {
        id: "student_shape",
        shape: "rectangle",
        x: 240,
        y: 180,
        width: 160,
        height: 100,
      },
      state,
    );
    state.objects.student_shape.createdBy = "user";
    state.objects.student_shape.updatedBy = "user";
    runTool(
      "write_text",
      { id: "ai_note", text: "AI note", x: 500, y: 220 },
      state,
    );

    expect(
      runTool("erase_object", { objectId: "student_shape" }, state).ok,
    ).toBe(false);
    expect(state.objects.student_shape).toBeDefined();

    expect(runTool("reset_board", {}, state).ok).toBe(true);
    expect(state.objects).toEqual({});

    runTool(
      "create_shape",
      {
        id: "student_shape",
        shape: "rectangle",
        x: 240,
        y: 180,
        width: 160,
        height: 100,
      },
      state,
    );
    state.objects.student_shape.createdBy = "user";
    state.objects.student_shape.updatedBy = "user";

    expect(
      runTool(
        "erase_object",
        { objectId: "student_shape", allowUserObject: true },
        state,
      ).ok,
    ).toBe(true);
    expect(state.objects.student_shape).toBeUndefined();
  });
});
