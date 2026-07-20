import { describe, expect, it } from "vitest";
import { STUDENT_DRAW_IDLE_MS } from "./captureStudentInk";

describe("captureStudentInk", () => {
  it("waits 5 seconds after drawing stops before notifying Mentora", () => {
    expect(STUDENT_DRAW_IDLE_MS).toBe(5000);
  });
});
