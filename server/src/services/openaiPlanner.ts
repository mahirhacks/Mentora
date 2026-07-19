import OpenAI from "openai";
import {
  LessonPlanSchema,
  type LessonPlan,
  fallbackSquareLesson,
  makeGenericFallbackLesson,
  isSquareFormulaTopic,
} from "@mentora/shared";
import { env } from "../env.js";


const plannerJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    topic: { type: "string" },
    prerequisites: { type: "array", items: { type: "string" } },
    misconceptions: { type: "array", items: { type: "string" } },
    objectives: { type: "array", items: { type: "string" } },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          strategy: { type: "string" },
          boardPlan: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          checkQuestion: { type: "string" },
          acceptedAnswers: { type: "array", items: { type: "string" } },
          hintLadder: { type: "array", items: { type: "string" } },
          fallbackExplanation: { type: "string" },
        },
        required: [
          "id",
          "title",
          "strategy",
          "boardPlan",
          "checkQuestion",
          "acceptedAnswers",
          "hintLadder",
          "fallbackExplanation",
        ],
      },
    },
    finalAssessment: {
      type: "object",
      additionalProperties: false,
      properties: {
        question: { type: "string" },
        acceptedAnswers: { type: "array", items: { type: "string" } },
      },
      required: ["question", "acceptedAnswers"],
    },
    masteryCriteria: {
      type: "object",
      additionalProperties: false,
      properties: {
        minCorrectStreak: { type: "number" },
        requireFinalAssessment: { type: "boolean" },
      },
      required: ["minCorrectStreak", "requireFinalAssessment"],
    },
  },
  required: [
    "title",
    "topic",
    "prerequisites",
    "misconceptions",
    "objectives",
    "steps",
    "finalAssessment",
    "masteryCriteria",
  ],
} as const;

function extractText(response: {
  output_text?: string;
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
}): string {
  if (response.output_text) return response.output_text;
  return (
    response.output
      ?.flatMap((item) =>
        item.type === "message"
          ? (item.content ?? [])
              .filter((c) => c.type === "output_text")
              .map((c) => c.text ?? "")
          : [],
      )
      .join("") ?? ""
  );
}

export async function planLesson(input: {
  topic: string;
  studentRequest?: string;
}): Promise<{ plan: LessonPlan; source: "terra" | "fallback"; error?: string }> {
  const client = new OpenAI({ apiKey: env.openaiApiKey() });
  const prompt = `You are Mentora's lesson planner. Create a structured LessonPlan for ANY subject the student asks.

Topic: ${input.topic}
Student request: ${input.studentRequest ?? "Teach this on a shared whiteboard"}

Rules:
- Teach visually. Each step should include a boardPlan with concrete draw/write actions when helpful.
- Valid board actions only: draw_rectangle, draw_circle, draw_line, draw_arrow, write_text, write_equation, point_at, show_pointer, highlight, pause, clear_board.
- Use stable unique objectIds (e.g. title_1, diagram_box, label_a).
- Canvas is 1100x620 px, origin top-left. Keep items in x=40..1060, y=40..580.
- Do NOT overlap text with boxes/arrows. Leave ≥16px gaps.
- Layout pattern: diagram LEFT (e.g. x=60..480), titles/formulas/explanations RIGHT (e.g. x=520..1040).
- write_text/write_equation (x,y) is TOP-LEFT of the text. Inside a box use (box.x+12, box.y+12).
- Prefer diagrams, labels, and short equations over walls of text.
- 3–5 steps. Short strings. One checkQuestion per step with acceptedAnswers + hintLadder (2–4 hints).
- If the topic is expanding (a+b)^2, use the classic area-model square approach.
- For science/history/other subjects, invent clear visual metaphors on the board.
- Coordinates must be concrete integers that won't collide.`;

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.responses.create({
        model: env.plannerModel,
        reasoning: { effort: "low" },
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "mentora_lesson_plan",
            strict: true,
            schema: plannerJsonSchema,
          },
        },
      });
      const text = extractText(response);
      const json = JSON.parse(text) as unknown;
      const parsed = LessonPlanSchema.safeParse(json);
      if (parsed.success) {
        return { plan: parsed.data, source: "terra" };
      }
      lastError = parsed.error.message;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  const fallback = isSquareFormulaTopic(input.topic)
    ? fallbackSquareLesson
    : makeGenericFallbackLesson(input.topic);

  return {
    plan: fallback,
    source: "fallback",
    error: lastError,
  };
}

export async function replanLesson(input: {
  reason: string;
  currentPlan: LessonPlan;
  completedStepIds: string[];
}): Promise<{ plan: LessonPlan; source: "terra" | "fallback"; error?: string }> {
  const remaining = input.currentPlan.steps.filter(
    (s) => !input.completedStepIds.includes(s.id),
  );
  const result = await planLesson({
    topic: input.currentPlan.topic,
    studentRequest: `Replan remaining steps only. Reason: ${input.reason}. Keep completed: ${input.completedStepIds.join(", ") || "none"}. Prior remaining: ${remaining.map((s) => s.title).join("; ")}`,
  });

  if (result.source === "terra") {
    const completedSteps = input.currentPlan.steps.filter((s) =>
      input.completedStepIds.includes(s.id),
    );
    return {
      ...result,
      plan: {
        ...result.plan,
        steps: [...completedSteps, ...result.plan.steps],
      },
    };
  }
  return result;
}
