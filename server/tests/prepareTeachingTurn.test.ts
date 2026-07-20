import { describe, expect, it } from "vitest";
import { createBoardState } from "../tools/index.js";
import { prepareTeachingTurn } from "../src/teaching/prepareTeachingTurn.js";
import type { TeachingStep } from "../src/teaching/types.js";

describe("prepareTeachingTurn", () => {
  it("preflights a complete script without mutating the input board", () => {
    const initial = createBoardState();
    const script: TeachingStep[] = [
      {
        kind: "tool",
        toolName: "create_shape",
        input: {
          id: "variable_box",
          shape: "rectangle",
          x: 200,
          y: 120,
          width: 240,
          height: 120,
        },
      },
      {
        kind: "observe",
        text: "The variable box exists.",
        boardObjectIds: ["variable_box"],
      },
      {
        kind: "speak",
        directive: {
          speechId: "ask_value",
          voiceScript: "What value is stored in the box?",
          boardObjectIds: ["variable_box"],
          finalQuestion: "What value is stored in the box?",
        },
      },
    ];

    const result = prepareTeachingTurn(script, initial);

    expect(result.ok).toBe(true);
    expect(initial).toEqual(createBoardState());
    if (result.ok) {
      expect(result.turn.steps).toHaveLength(3);
      expect(result.turn.finalBoardState.objects.variable_box).toBeDefined();
    }
  });

  it("rejects a later missing reference without partial live state", () => {
    const initial = createBoardState();
    const script: TeachingStep[] = [
      {
        kind: "tool",
        toolName: "write_text",
        input: { id: "known", text: "Known", x: 200, y: 200 },
      },
      {
        kind: "speak",
        directive: {
          speechId: "bad_reference",
          voiceScript: "Look at the missing object.",
          boardObjectIds: ["missing"],
          finalQuestion: "What do you see?",
        },
      },
    ];

    const result = prepareTeachingTurn(script, initial);

    expect(result.ok).toBe(false);
    expect(initial).toEqual(createBoardState());
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({
        stepIndex: 1,
        code: "missing_reference",
      });
    }
  });

  it("rejects a visual collision after each board edit", () => {
    const initial = createBoardState();
    const script: TeachingStep[] = [
      {
        kind: "tool",
        toolName: "write_text",
        input: {
          id: "first_line",
          text: "First explanation",
          x: 200,
          y: 200,
          fontSize: 24,
        },
      },
      {
        kind: "tool",
        toolName: "write_text",
        input: {
          id: "overlapping_line",
          text: "Overlapping explanation",
          x: 210,
          y: 205,
          fontSize: 24,
        },
      },
    ];

    const result = prepareTeachingTurn(script, initial);

    expect(result.ok).toBe(false);
    expect(initial).toEqual(createBoardState());
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({
        stepIndex: 1,
        code: "layout_collision",
      });
      expect(result.issues[0].message).toContain("first_line");
      expect(result.issues[0].message).toContain("overlapping_line");
    }
  });

  it("can replace occupied text during the bounded fallback", () => {
    const initial = createBoardState();
    const setup = prepareTeachingTurn(
      [
        {
          kind: "tool",
          toolName: "write_text",
          input: {
            id: "obsolete_line",
            text: "Old explanation",
            x: 200,
            y: 200,
            fontSize: 24,
          },
        },
      ],
      initial,
    );
    if (!setup.ok) {
      throw new Error("Expected setup to succeed.");
    }

    const replacement: TeachingStep[] = [
      {
        kind: "tool",
        toolName: "write_text",
        input: {
          id: "replacement_line",
          text: "Updated explanation",
          x: 205,
          y: 205,
          fontSize: 24,
        },
      },
    ];

    const result = prepareTeachingTurn(
      replacement,
      setup.turn.finalBoardState,
      { resolveOccupiedOverlays: true },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.turn.finalBoardState.objects.obsolete_line,
      ).toBeUndefined();
      expect(
        result.turn.finalBoardState.objects.replacement_line,
      ).toBeDefined();
    }
  });

  it("allows explicit erase steps while preserving implicit text", () => {
    const initial = createBoardState();
    const script: TeachingStep[] = [
      {
        kind: "tool",
        toolName: "write_text",
        input: {
          id: "old_text",
          text: "Old explanation",
          x: 200,
          y: 200,
        },
      },
      {
        kind: "tool",
        toolName: "erase_object",
        input: { objectId: "old_text" },
      },
    ];

    const result = prepareTeachingTurn(script, initial);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turn.finalBoardState.objects.old_text).toBeUndefined();
    }
  });
});
