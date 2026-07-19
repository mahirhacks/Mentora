import { describe, expect, it } from "vitest";
import {
  BoardActionSchema,
  BoardApplyActionsArgsSchema,
  isBlockingAction,
} from "./board.js";

describe("board schemas", () => {
  it("accepts draw_rectangle", () => {
    const parsed = BoardActionSchema.parse({
      type: "draw_rectangle",
      objectId: "sq1",
      x: 10,
      y: 20,
      width: 100,
      height: 100,
    });
    expect(parsed.type).toBe("draw_rectangle");
    expect(isBlockingAction(parsed)).toBe(true);
  });

  it("marks point_at as non-blocking", () => {
    const parsed = BoardActionSchema.parse({
      type: "point_at",
      objectId: "sq1",
      holdMs: 1000,
    });
    expect(isBlockingAction(parsed)).toBe(false);
  });

  it("rejects unknown action type", () => {
    const result = BoardActionSchema.safeParse({
      type: "draw_unicorn",
      objectId: "x",
    });
    expect(result.success).toBe(false);
  });

  it("validates action batches", () => {
    const result = BoardApplyActionsArgsSchema.safeParse({
      actions: [
        {
          type: "write_equation",
          objectId: "eq1",
          x: 1,
          y: 2,
          latex: "a^2",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
