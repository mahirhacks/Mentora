import { z } from "zod";
import { BoardActionSchema } from "./board.js";

export const StudentResponseClassificationSchema = z.enum([
  "correct_with_understanding",
  "correct_with_hint",
  "partially_correct",
  "incorrect_calculation",
  "incorrect_concept",
  "missing_prerequisite",
  "does_not_know",
  "off_topic",
  "unclear_audio",
  "student_visual_attempt",
]);

export type StudentResponseClassification = z.infer<
  typeof StudentResponseClassificationSchema
>;

export const TeachingPhaseSchema = z.enum([
  "idle",
  "understanding_request",
  "planning",
  "diagnosing",
  "teaching",
  "asking",
  "waiting_for_student",
  "evaluating",
  "assessing",
  "remediating",
  "complete",
]);

export type TeachingPhase = z.infer<typeof TeachingPhaseSchema>;

export const LessonStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  strategy: z.string().min(1),
  boardPlan: z.array(BoardActionSchema).default([]),
  checkQuestion: z.string().min(1),
  acceptedAnswers: z.array(z.string()).min(1),
  hintLadder: z.array(z.string()).min(1).max(4),
  fallbackExplanation: z.string().min(1),
});

export type LessonStep = z.infer<typeof LessonStepSchema>;

export const LessonPlanSchema = z.object({
  title: z.string().min(1),
  topic: z.string().min(1),
  prerequisites: z.array(z.string()).default([]),
  misconceptions: z.array(z.string()).default([]),
  objectives: z.array(z.string()).min(1),
  steps: z.array(LessonStepSchema).min(1),
  finalAssessment: z.object({
    question: z.string().min(1),
    acceptedAnswers: z.array(z.string()).min(1),
  }),
  masteryCriteria: z.object({
    minCorrectStreak: z.number().int().positive().default(2),
    requireFinalAssessment: z.boolean().default(true),
  }),
});

export type LessonPlan = z.infer<typeof LessonPlanSchema>;

export const LessonRuntimeStateSchema = z.object({
  phase: TeachingPhaseSchema,
  planTitle: z.string().optional(),
  currentStepIndex: z.number().int().nonnegative().default(0),
  completedStepIds: z.array(z.string()).default([]),
  understanding: z.number().min(0).max(1).default(0.5),
  hintLevel: z.number().int().nonnegative().default(0),
  misconceptionsSeen: z.array(z.string()).default([]),
  questionsAsked: z.number().int().nonnegative().default(0),
  correctStreak: z.number().int().nonnegative().default(0),
  wasInterrupted: z.boolean().default(false),
  studentBoardActive: z.boolean().default(false),
  pendingStudentStrokeIds: z.array(z.string()).default([]),
  boardObjectIds: z.array(z.string()).default([]),
  lastClassification: StudentResponseClassificationSchema.optional(),
  startedAt: z.number().int().optional(),
  completedAt: z.number().int().optional(),
});

export type LessonRuntimeState = z.infer<typeof LessonRuntimeStateSchema>;
