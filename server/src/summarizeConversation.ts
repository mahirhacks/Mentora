import type OpenAI from "openai";

export interface ConversationSummary {
  topic: string;
  summary: string;
}

interface TranscriptLine {
  kind: "student" | "speak";
  text: string;
}

function formatTranscript(entries: TranscriptLine[]) {
  return entries
    .map((entry) => {
      const speaker = entry.kind === "student" ? "Student" : "Mentora";
      return `${speaker}: ${entry.text.trim()}`;
    })
    .filter((line) => line.length > 10)
    .join("\n");
}

function parseSummaryPayload(raw: string): ConversationSummary | null {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned) as {
      topic?: unknown;
      summary?: unknown;
    };
    if (
      typeof parsed.topic !== "string" ||
      typeof parsed.summary !== "string"
    ) {
      return null;
    }
    const topic = parsed.topic.trim();
    const summary = parsed.summary.trim();
    if (!topic || !summary) {
      return null;
    }
    return { topic, summary };
  } catch {
    return null;
  }
}

/**
 * Summarize a lesson transcript with the planner model for student notes.
 */
export async function summarizeConversation(
  client: OpenAI,
  model: string,
  entries: TranscriptLine[],
): Promise<ConversationSummary> {
  const transcript = formatTranscript(entries);
  if (!transcript) {
    throw new Error("Nothing to summarize yet. Have a short conversation first.");
  }

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: [
          "You summarize Mentora teaching conversations for a student's private notes.",
          "Return ONLY valid JSON with this exact shape:",
          '{"topic":"short topic title","summary":"concise summary"}',
          "Rules:",
          "- topic: a short title naming the main concept that was taught",
          "- summary: 2-5 clear sentences covering what was explained and clarified",
          "- Use only facts present in the transcript",
          "- Do not mention tools, boards, IDs, or system internals",
          "- Do not include markdown fences or extra keys",
        ].join("\n"),
      },
      {
        role: "user",
        content: `Summarize this lesson conversation:\n\n${transcript}`,
      },
    ],
    reasoning_effort: "none" as "low",
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  const parsed = parseSummaryPayload(raw);
  if (!parsed) {
    throw new Error("Failed to summarize the conversation. Try again.");
  }
  return parsed;
}

export function appendSummaryToNotes(
  notes: string,
  summary: ConversationSummary,
): string {
  const block = `${summary.topic}\n${summary.summary}`;
  const trimmed = notes.replace(/\s+$/, "");
  if (!trimmed) {
    return `${block}\n`;
  }
  return `${trimmed}\n\n${block}\n`;
}
