import { describe, expect, it } from "vitest";
import { LessonPlanSchema, fallbackSquareLesson } from "./index.js";

describe("fallbackSquareLesson", () => {
  it("parses as LessonPlan", () => {
    const parsed = LessonPlanSchema.parse(fallbackSquareLesson);
    expect(parsed.steps.length).toBeGreaterThanOrEqual(4);
    expect(parsed.title).toContain("a+b");
  });
});
