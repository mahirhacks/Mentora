import { describe, expect, it } from "vitest";
import {
  createInitialRuntime,
  markStepComplete,
  recordClassification,
  setPhase,
} from "./teachingStateMachine";

describe("teachingStateMachine", () => {
  it("starts idle", () => {
    expect(createInitialRuntime().phase).toBe("idle");
  });

  it("records correct classification streak", () => {
    let rt = createInitialRuntime();
    rt = recordClassification(rt, "correct_with_understanding");
    expect(rt.correctStreak).toBe(1);
    rt = recordClassification(rt, "incorrect_concept");
    expect(rt.correctStreak).toBe(0);
  });

  it("marks steps complete", () => {
    let rt = setPhase(createInitialRuntime(), "teaching");
    rt = markStepComplete(rt, "intro");
    expect(rt.completedStepIds).toContain("intro");
    expect(rt.currentStepIndex).toBe(1);
  });
});
