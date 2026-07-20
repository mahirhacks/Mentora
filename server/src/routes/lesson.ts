import { Router } from "express";
import {
  DecideRequestSchema,
  LessonPlanSchema,
  fallbackSquareLesson,
  makeGenericFallbackLesson,
  isSquareFormulaTopic,
  normalizeTopic,
  makeFallbackTeachingBeat,
} from "@mentora/shared";
import { planLesson, replanLesson } from "../services/openaiPlanner.js";
import { decideTeachingBeat } from "../services/openaiDecide.js";

export const lessonRouter = Router();

function fallbackForTopic(topic: string) {
  const subject = normalizeTopic(topic);
  return isSquareFormulaTopic(subject)
    ? fallbackSquareLesson
    : makeGenericFallbackLesson(subject);
}

lessonRouter.post("/plan", async (req, res) => {
  try {
    const topic = String(req.body?.topic ?? "Expanding (a+b)^2");
    const studentRequest =
      typeof req.body?.studentRequest === "string"
        ? req.body.studentRequest
        : undefined;
    const demoSafe = req.body?.demoSafeMode === true;

    if (demoSafe) {
      res.json({ plan: fallbackForTopic(topic), source: "fallback" });
      return;
    }

    const result = await planLesson({ topic, studentRequest });
    res.json(result);
  } catch (err) {
    const topic = String(req.body?.topic ?? "Expanding (a+b)^2");
    res.status(500).json({
      plan: fallbackForTopic(topic),
      source: "fallback",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

lessonRouter.post("/decide", async (req, res) => {
  try {
    const parsed = DecideRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const beat = makeFallbackTeachingBeat({
        studentAnswer: String(req.body?.studentAnswer ?? ""),
        topic: String(req.body?.topic ?? "topic"),
        checkQuestion: req.body?.checkQuestion
          ? String(req.body.checkQuestion)
          : undefined,
        fallbackExplanation: req.body?.fallbackExplanation
          ? String(req.body.fallbackExplanation)
          : undefined,
      });
      res.json({
        beat,
        source: "fallback",
        error: parsed.error.message,
      });
      return;
    }
    const result = await decideTeachingBeat(parsed.data);
    res.json(result);
  } catch (err) {
    const beat = makeFallbackTeachingBeat({
      studentAnswer: String(req.body?.studentAnswer ?? ""),
      topic: String(req.body?.topic ?? "topic"),
    });
    res.status(500).json({
      beat,
      source: "fallback",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

lessonRouter.post("/replan", async (req, res) => {
  try {
    const reason = String(req.body?.reason ?? "student confusion");
    const completedStepIds = Array.isArray(req.body?.completedStepIds)
      ? req.body.completedStepIds.map(String)
      : [];
    const parsed = LessonPlanSchema.safeParse(req.body?.currentPlan);
    const topicGuess = String(req.body?.topic ?? "topic");
    const currentPlan = parsed.success
      ? parsed.data
      : fallbackForTopic(topicGuess);
    const result = await replanLesson({ reason, currentPlan, completedStepIds });
    res.json(result);
  } catch (err) {
    const topic = String(
      req.body?.currentPlan?.topic ?? req.body?.topic ?? "topic",
    );
    res.status(500).json({
      plan: fallbackForTopic(topic),
      source: "fallback",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

lessonRouter.post("/summary", async (req, res) => {
  const understanding = Number(req.body?.understanding ?? 0.8);
  const questionsAsked = Number(req.body?.questionsAsked ?? 0);
  const hintsUsed = Number(req.body?.hintsUsed ?? 0);
  const topic = String(req.body?.topic ?? "today's lesson");
  res.json({
    understanding,
    questionsAsked,
    hintsUsed,
    whatYouLearned: [
      `Core ideas from ${topic}`,
      "Visual explanations on the whiteboard",
      "Checked understanding with questions",
    ],
  });
});
