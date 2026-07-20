import { describe, expect, it } from "vitest";
import {
  initialTurnState,
  isTurnActive,
  turnReducer,
} from "./turnState";

describe("turnReducer", () => {
  it("moves through planning, drawing, speaking, and ready", () => {
    const planning = turnReducer(initialTurnState, { type: "planning" });
    const drawing = turnReducer(planning, {
      type: "drawing",
      toolName: "write_text",
    });
    const speaking = turnReducer(drawing, { type: "speaking" });
    const ready = turnReducer(speaking, { type: "ready" });

    expect(isTurnActive(planning.phase)).toBe(true);
    expect(drawing.activeToolName).toBe("write_text");
    expect(speaking.phase).toBe("speaking");
    expect(ready).toEqual(initialTurnState);
  });

  it("retains recoverable error state for Retry UI", () => {
    const state = turnReducer(initialTurnState, {
      type: "error",
      message: "Try again.",
      recoverable: true,
    });

    expect(state).toMatchObject({
      phase: "recoverable_error",
      error: "Try again.",
      recoverable: true,
    });
  });
});
