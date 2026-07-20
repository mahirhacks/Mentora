import { create } from "zustand";
import {
  makeGenericFallbackLesson,
  normalizeTopic,
  type LessonPlan,
  type LessonRuntimeState,
} from "@mentora/shared";
import { createInitialRuntime } from "../teaching/teachingStateMachine";

type TeachingStore = {
  plan: LessonPlan;
  runtime: LessonRuntimeState;
  planSource: string;
  hintsUsed: number;
  /** Clean subject to teach (e.g. "Python"), not "Teach me Python". */
  topicRequest: string;
  studentRequest: string;
  setTopicRequest: (topic: string, studentRequest?: string) => void;
  setPlan: (plan: LessonPlan, source?: string) => void;
  setRuntime: (runtime: LessonRuntimeState) => void;
  patchRuntime: (patch: Partial<LessonRuntimeState>) => void;
  bumpHints: () => void;
  resetTeaching: (topic?: string) => void;
};

const blankPlan = makeGenericFallbackLesson("New lesson");

export const useTeachingStore = create<TeachingStore>((set, get) => ({
  plan: blankPlan,
  runtime: createInitialRuntime(),
  planSource: "idle",
  hintsUsed: 0,
  topicRequest: "",
  studentRequest: "",
  setTopicRequest: (topic, studentRequest) => {
    const clean = normalizeTopic(topic);
    const original = topic.trim();
    set({
      topicRequest: clean,
      studentRequest:
        studentRequest?.trim() ||
        `Teach me ${original || clean || "this topic"} on the whiteboard`,
    });
  },
  setPlan: (plan, source = "terra") => set({ plan, planSource: source }),
  setRuntime: (runtime) => set({ runtime }),
  patchRuntime: (patch) => set({ runtime: { ...get().runtime, ...patch } }),
  bumpHints: () => set({ hintsUsed: get().hintsUsed + 1 }),
  resetTeaching: (topic) => {
    const label = topic ? normalizeTopic(topic) : "New lesson";
    set({
      plan: makeGenericFallbackLesson(label),
      runtime: createInitialRuntime(),
      planSource: topic?.trim() ? "preparing" : "idle",
      hintsUsed: 0,
    });
  },
}));
