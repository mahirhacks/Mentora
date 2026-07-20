import OpenAI from "openai";
import {
  coerceTeachingChoreography,
  makeFallbackTeachingBeat,
  repairChoreography,
  sanitizeOpsList,
  teachingChoreographyJsonSchema,
  type DecideRequest,
  type TeachingChoreography,
} from "@mentora/shared";
import { env } from "../env.js";

function extractText(response: {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (response.output_text?.trim()) return response.output_text.trim();
  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .filter((c) => c.type === "output_text" || typeof c.text === "string")
      .map((c) => c.text ?? "")
      .join("") ?? ""
  );
}

function sanitizeCues(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((cue, i) => {
    if (!cue || typeof cue !== "object") return cue;
    const c = cue as Record<string, unknown>;
    const during = Array.isArray(c.actionsDuring)
      ? c.actionsDuring.map((t, j) => {
          if (!t || typeof t !== "object") return t;
          const tr = t as Record<string, unknown>;
          return {
            ...tr,
            triggerId: String(tr.triggerId ?? `t${i}_${j}`),
            actions: sanitizeOpsList(tr.actions),
            fallbackAtMs:
              typeof tr.fallbackAtMs === "number" ? tr.fallbackAtMs : 0,
          };
        })
      : [];
    return {
      ...c,
      cueId: String(c.cueId ?? `cue_${i + 1}`),
      actionsBefore: sanitizeOpsList(c.actionsBefore),
      actionsDuring: during,
      actionsAfter: sanitizeOpsList(c.actionsAfter),
    };
  });
}

export async function decideTeachingBeat(
  input: DecideRequest,
): Promise<{
  beat: TeachingChoreography;
  source: "terra" | "fallback";
  error?: string;
}> {
  const fallback = makeFallbackTeachingBeat({
    studentAnswer: input.studentAnswer,
    checkQuestion: input.checkQuestion,
    fallbackExplanation: input.fallbackExplanation,
    topic: input.topic,
  });

  const boardLines = input.semanticBoard
    .slice(0, 40)
    .map(
      (o) =>
        `- ${o.id} (${o.type}) label="${o.label}" author=${o.author} rel=${o.relationship || "none"}`,
    )
    .join("\n");

  const historyLines = input.recentHistory
    .slice(-6)
    .map((h) => `${h.role}: ${h.text.slice(0, 200)}`)
    .join("\n");

  const prompt = `You are Mentora's teaching decision brain (not the voice).
Produce a TeachingChoreography: short atomic cues the client will speak while syncing the board.

Topic: ${input.topic}
Plan: ${input.planTitle ?? input.topic}
Step index: ${input.currentStepIndex}
Step: ${input.stepTitle ?? "current"}
Prior check question: ${input.checkQuestion ?? "(none)"}
Accepted answer hints: ${(input.acceptedAnswers ?? []).slice(0, 4).join(" | ") || "(none)"}

Student answer: ${input.studentAnswer}

Recent transcript:
${historyLines || "(none)"}

Semantic board RIGHT NOW (already visible — use these ids):
${boardLines || "(empty board)"}

HARD RULES — canvas:
- You CAN draw. Never say you cannot use the canvas/board. Never say "imagine a square" when a square is on the board.
- If the student asks to see it visually / on the canvas: include real board ops.

ATOMIC CUES (critical):
- cues = 2–6 items. Each voiceScript = ONE short sentence (~2–5 seconds spoken). Never a paragraph.
- actionsBefore = structural only: create_shape, divide_region, label_in, place_relative, pause. Apply BEFORE speech.
- actionsDuring = lightweight only: point_at / highlight with holdMs ~1800. Each triggerPhrase MUST be a contiguous fragment of that cue's voiceScript.
- actionsAfter = optional structural cleanup/equations after the cue finishes.
- Do NOT put divide_region / create_shape in actionsDuring.
- fallbackAtMs = estimated ms from cue start when the phrase should fire (phrase position × speech duration + 250). Prefer supplying it; 0 means client will estimate.
- nextQuestion = ONE clear check question asked ONLY after the final cue (client appends it). Do not put it inside voiceScripts.
- understandingDelta between -0.15 and 0.15.
- completedStepId = lesson step id if complete, else null.
- Prefer point_at/highlight on existing ids. Never invent pixel x/y.`;

  try {
    const client = new OpenAI({ apiKey: env.openaiApiKey() });
    const response = await client.responses.create({
      model: env.plannerModel,
      reasoning: { effort: "low" },
      max_output_tokens: 1100,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "mentora_teaching_choreography",
          strict: true,
          schema: teachingChoreographyJsonSchema,
        },
      },
    });
    const text = extractText(response as {
      output_text?: string;
      output?: Array<{
        content?: Array<{ type?: string; text?: string }>;
      }>;
    });
    const json = JSON.parse(text) as Record<string, unknown>;
    json.cues = sanitizeCues(json.cues);

    const coerced = coerceTeachingChoreography(json);
    if (coerced) {
      return {
        beat: repairChoreography(coerced, {
          studentAnswer: input.studentAnswer,
          semanticBoard: input.semanticBoard,
          topic: input.topic,
          checkQuestion: input.checkQuestion,
        }),
        source: "terra",
      };
    }

    const soft = coerceTeachingChoreography({
      ...json,
      cues: Array.isArray(json.cues)
        ? (json.cues as Record<string, unknown>[]).map((c) => ({
            ...c,
            actionsBefore: [],
            actionsDuring: [],
            actionsAfter: [],
          }))
        : [
            {
              cueId: "soft_1",
              voiceScript: "Let's keep going.",
              actionsBefore: [],
              actionsDuring: [],
              actionsAfter: [],
            },
          ],
    });
    if (soft) {
      return {
        beat: repairChoreography(soft, {
          studentAnswer: input.studentAnswer,
          semanticBoard: input.semanticBoard,
          topic: input.topic,
          checkQuestion: input.checkQuestion,
        }),
        source: "fallback",
        error: "soft_parse",
      };
    }
    return {
      beat: repairChoreography(fallback, {
        studentAnswer: input.studentAnswer,
        semanticBoard: input.semanticBoard,
        topic: input.topic,
        checkQuestion: input.checkQuestion,
      }),
      source: "fallback",
      error: "coerce_failed",
    };
  } catch (err) {
    return {
      beat: repairChoreography(fallback, {
        studentAnswer: input.studentAnswer,
        semanticBoard: input.semanticBoard,
        topic: input.topic,
        checkQuestion: input.checkQuestion,
      }),
      source: "fallback",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
