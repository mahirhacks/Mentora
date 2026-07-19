import { create } from "zustand";
import {
  fallbackSquareLesson,
  type LessonPlan,
  type LessonRuntimeState,
} from "@mentora/shared";
import { createInitialRuntime } from "../teaching/teachingStateMachine";

type TeachingStore = {
  plan: LessonPlan;
  runtime: LessonRuntimeState;
  planSource: string;
  hintsUsed: number;
  /** Free-form topic the student asked to learn */
  topicRequest: string;
  studentRequest: string;
  setTopicRequest: (topic: string, studentRequest?: string) => void;
  setPlan: (plan: LessonPlan, source?: string) => void;
  setRuntime: (runtime: LessonRuntimeState) => void;
  patchRuntime: (patch: Partial<LessonRuntimeState>) => void;
  bumpHints: () => void;
  resetTeaching: () => void;
};

export const useTeachingStore = create<TeachingStore>((set, get) => ({
  plan: fallbackSquareLesson,
  runtime: createInitialRuntime(),
  planSource: "fallback",
  hintsUsed: 0,
  topicRequest: "",
  studentRequest: "",
  setTopicRequest: (topic, studentRequest) =>
    set({
      topicRequest: topic.trim(),
      studentRequest:
        studentRequest?.trim() ||
        `Teach me ${topic.trim() || "this topic"} on the whiteboard`,
    }),
  setPlan: (plan, source = "terra") => set({ plan, planSource: source }),
  setRuntime: (runtime) => set({ runtime }),
  patchRuntime: (patch) => set({ runtime: { ...get().runtime, ...patch } }),
  bumpHints: () => set({ hintsUsed: get().hintsUsed + 1 }),
  resetTeaching: () =>
    set({
      plan: fallbackSquareLesson,
      runtime: createInitialRuntime(),
      planSource: "fallback",
      hintsUsed: 0,
    }),
}));
