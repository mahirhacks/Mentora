import type { LessonPlan } from "@mentora/shared";

export async function createLessonPlan(input: {
  topic: string;
  studentRequest?: string;
  demoSafeMode?: boolean;
}): Promise<{ plan: LessonPlan; source: string; error?: string }> {
  const res = await fetch("/api/lesson/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<{ plan: LessonPlan; source: string; error?: string }>;
}

export async function replanLesson(input: {
  reason: string;
  currentPlan: LessonPlan;
  completedStepIds: string[];
}): Promise<{ plan: LessonPlan; source: string; error?: string }> {
  const res = await fetch("/api/lesson/replan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<{ plan: LessonPlan; source: string; error?: string }>;
}

export async function fetchLessonSummary(input: {
  understanding: number;
  questionsAsked: number;
  hintsUsed: number;
  topic?: string;
}) {
  const res = await fetch("/api/lesson/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<{
    understanding: number;
    questionsAsked: number;
    hintsUsed: number;
    whatYouLearned: string[];
  }>;
}
