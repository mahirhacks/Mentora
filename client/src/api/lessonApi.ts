import type { LessonPlan } from "@mentora/shared";
import type { DecideRequest, TeachingChoreography } from "@mentora/shared";
import { mentoraProbe } from "../testing/mentoraTestProbe";

export type DecideTeachingBeatFn = (
  input: DecideRequest,
  timeoutMs?: number,
) => Promise<{ beat: TeachingChoreography; source: string; error?: string }>;

/** Test-only override — never set in production. */
let decideOverride: DecideTeachingBeatFn | null = null;

export function setDecideTeachingBeatOverride(
  fn: DecideTeachingBeatFn | null,
) {
  decideOverride = fn;
}

async function postJson<T>(
  url: string,
  body: unknown,
  timeoutMs = 45000,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(
      data.message || data.error || `Request failed (${res.status})`,
    );
  }
  return data;
}

export async function createLessonPlan(input: {
  topic: string;
  studentRequest?: string;
  demoSafeMode?: boolean;
}): Promise<{ plan: LessonPlan; source: string; error?: string }> {
  return postJson("/api/lesson/plan", input);
}

export async function replanLesson(input: {
  reason: string;
  currentPlan: LessonPlan;
  completedStepIds: string[];
}): Promise<{ plan: LessonPlan; source: string; error?: string }> {
  return postJson("/api/lesson/replan", input);
}

/** Decision API — keep timeout short (4–6s) so the student never hangs. */
export async function decideTeachingBeat(
  input: DecideRequest,
  timeoutMs = 5000,
): Promise<{ beat: TeachingChoreography; source: string; error?: string }> {
  mentoraProbe("decide", "decide_requested", {
    studentAnswer: input.studentAnswer.slice(0, 80),
    currentStepIndex: input.currentStepIndex,
  });
  if (decideOverride) {
    const result = await decideOverride(input, timeoutMs);
    mentoraProbe("decide", "decide_resolved", {
      source: result.source,
      cueCount: result.beat.cues.length,
      mocked: true,
    });
    return result;
  }
  const result = await postJson<{
    beat: TeachingChoreography;
    source: string;
    error?: string;
  }>("/api/lesson/decide", input, timeoutMs);
  mentoraProbe("decide", "decide_resolved", {
    source: result.source,
    cueCount: result.beat.cues.length,
    mocked: false,
  });
  return result;
}

export async function fetchLessonSummary(input: {
  understanding: number;
  questionsAsked: number;
  hintsUsed: number;
  topic?: string;
}) {
  return postJson<{
    understanding: number;
    questionsAsked: number;
    hintsUsed: number;
    whatYouLearned: string[];
  }>("/api/lesson/summary", input);
}
