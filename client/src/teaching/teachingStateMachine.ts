import type { LessonRuntimeState, TeachingPhase } from "@mentora/shared";

export function createInitialRuntime(): LessonRuntimeState {
  return {
    phase: "idle",
    currentStepIndex: 0,
    completedStepIds: [],
    understanding: 0.5,
    hintLevel: 0,
    misconceptionsSeen: [],
    questionsAsked: 0,
    correctStreak: 0,
    wasInterrupted: false,
    studentBoardActive: false,
    pendingStudentStrokeIds: [],
    boardObjectIds: [],
    startedAt: Date.now(),
  };
}

export function canLeaveWaiting(runtime: LessonRuntimeState): boolean {
  return (
    runtime.phase !== "waiting_for_student" ||
    runtime.wasInterrupted ||
    runtime.studentBoardActive ||
    runtime.pendingStudentStrokeIds.length > 0
  );
}

export function setPhase(
  runtime: LessonRuntimeState,
  phase: TeachingPhase,
): LessonRuntimeState {
  return { ...runtime, phase };
}

export function recordClassification(
  runtime: LessonRuntimeState,
  classification: LessonRuntimeState["lastClassification"],
): LessonRuntimeState {
  const correct =
    classification === "correct_with_understanding" ||
    classification === "correct_with_hint";
  return {
    ...runtime,
    lastClassification: classification,
    correctStreak: correct ? runtime.correctStreak + 1 : 0,
    understanding: Math.min(
      1,
      Math.max(
        0,
        runtime.understanding + (correct ? 0.08 : classification === "does_not_know" ? -0.02 : -0.05),
      ),
    ),
    hintLevel:
      classification === "does_not_know" ||
      classification === "partially_correct" ||
      classification === "incorrect_concept" ||
      classification === "incorrect_calculation"
        ? Math.min(4, runtime.hintLevel + 1)
        : runtime.hintLevel,
  };
}

export function markStepComplete(
  runtime: LessonRuntimeState,
  stepId: string,
): LessonRuntimeState {
  if (runtime.completedStepIds.includes(stepId)) return runtime;
  return {
    ...runtime,
    completedStepIds: [...runtime.completedStepIds, stepId],
    currentStepIndex: runtime.currentStepIndex + 1,
    hintLevel: 0,
  };
}

export function masteryReached(
  runtime: LessonRuntimeState,
  minCorrectStreak: number,
): boolean {
  return (
    runtime.correctStreak >= minCorrectStreak &&
    runtime.phase === "assessing"
  );
}
