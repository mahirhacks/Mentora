import { describe, expect, it } from "vitest";
import { createBoardState, runTool } from "../tools/index.js";
import { assertBoardPostconditions } from "../tools/postconditions.js";
import { applyUserBoardAction } from "../src/userBoardActions.js";

describe("user board actions", () => {
  it("creates user-owned shapes and records their activity", () => {
    const state = applyUserBoardAction(createBoardState(), {
      type: "shape",
      shape: "triangle",
      from: { x: 180, y: 160 },
      to: { x: 360, y: 320 },
    });

    const shape = Object.values(state.objects)[0];
    expect(shape.kind).toBe("shape");
    expect(shape.createdBy).toBe("user");
    expect(shape.updatedBy).toBe("user");
    expect(state.activity?.at(-1)).toMatchObject({
      actor: "user",
      action: "create",
      objectIds: [shape.id],
    });
    expect(assertBoardPostconditions(state)).toEqual({ ok: true });
  });

  it("keeps AI provenance distinct from subsequent user work", () => {
    const state = createBoardState();
    runTool(
      "write_text",
      {
        id: "ai_equation",
        text: "2 + 2 = 4",
        x: 300,
        y: 180,
      },
      state,
    );
    const edited = applyUserBoardAction(state, {
      type: "pencil",
      points: [
        { x: 280, y: 260 },
        { x: 320, y: 280 },
        { x: 360, y: 260 },
      ],
    });

    expect(edited.objects.ai_equation.createdBy).toBe("ai");
    const stroke = Object.values(edited.objects).find(
      (object) => object.id !== "ai_equation",
    );
    expect(stroke?.createdBy).toBe("user");
  });

  it("moves anchored objects together and logs the edit", () => {
    const state = createBoardState();
    runTool(
      "create_shape",
      {
        id: "box",
        shape: "rectangle",
        x: 240,
        y: 180,
        width: 180,
        height: 100,
      },
      state,
    );
    runTool(
      "label_in",
      {
        targetId: "box",
        text: "Student idea",
        position: "center",
      },
      state,
    );
    const label = Object.values(state.objects).find(
      (object) => object.kind === "label",
    );
    expect(label).toBeDefined();
    const originalLabelX = label!.bounds.x;

    const moved = applyUserBoardAction(state, {
      type: "move",
      objectId: "box",
      dx: 80,
      dy: 40,
    });

    expect(moved.objects.box.bounds.x).toBe(320);
    expect(moved.objects[label!.id].bounds.x).toBe(originalLabelX + 80);
    expect(moved.objects.box.updatedBy).toBe("user");
    expect(moved.activity?.at(-1)?.action).toBe("move");
    expect(assertBoardPostconditions(moved)).toEqual({ ok: true });
  });

  it("erases dependent references with the selected object", () => {
    const state = createBoardState();
    runTool(
      "create_shape",
      {
        id: "box",
        shape: "rectangle",
        x: 240,
        y: 180,
        width: 180,
        height: 100,
      },
      state,
    );
    runTool(
      "label_in",
      {
        targetId: "box",
        text: "Remove me",
        position: "center",
      },
      state,
    );
    const label = Object.values(state.objects).find(
      (object) => object.kind === "label",
    );
    expect(label).toBeDefined();

    const erased = applyUserBoardAction(state, {
      type: "erase",
      objectId: "box",
    });

    expect(erased.objects.box).toBeUndefined();
    expect(erased.objects[label!.id]).toBeUndefined();
    expect(erased.activity?.at(-1)).toMatchObject({
      actor: "user",
      action: "erase",
    });
    expect(assertBoardPostconditions(erased)).toEqual({ ok: true });
  });
});
