import OpenAI from "openai";
import { toOpenAiTools } from "./openaiTools.js";
import type { TeachingSession } from "./session.js";
import { parseTeachingScript } from "./teachingScript.js";
import type { TeachingStep } from "./types.js";

interface ToolCallDraft {
  id: string;
  name: string;
  argumentsText: string;
}

export async function planTeachingScript(
  client: OpenAI,
  model: string,
  session: TeachingSession,
): Promise<TeachingStep[]> {
  const completion = await client.chat.completions.create({
    model,
    messages: session.messages,
    tools: toOpenAiTools(),
    tool_choice: {
      type: "function",
      function: { name: "submit_teaching_script" },
    },
    reasoning_effort: "none" as "low",
  });

  const message = completion.choices[0]?.message;
  const toolCall = message?.tool_calls?.[0];

  if (
    toolCall?.type === "function" &&
    toolCall.function.name === "submit_teaching_script"
  ) {
    try {
      const parsed = JSON.parse(toolCall.function.arguments) as Record<
        string,
        unknown
      >;
      return parseTeachingScript(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

export async function streamTeachingScript(
  client: OpenAI,
  model: string,
  session: TeachingSession,
  onChunk?: (partialArguments: string) => void,
): Promise<TeachingStep[]> {
  const stream = await client.chat.completions.create({
    model,
    messages: session.messages,
    tools: toOpenAiTools(),
    tool_choice: {
      type: "function",
      function: { name: "submit_teaching_script" },
    },
    reasoning_effort: "none" as "low",
    stream: true,
  });

  const draft: ToolCallDraft = { id: "", name: "", argumentsText: "" };

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta?.tool_calls) {
      continue;
    }

    for (const toolDelta of delta.tool_calls) {
      if (toolDelta.id) {
        draft.id = toolDelta.id;
      }
      if (toolDelta.function?.name) {
        draft.name = toolDelta.function.name;
      }
      if (toolDelta.function?.arguments) {
        draft.argumentsText += toolDelta.function.arguments;
        onChunk?.(draft.argumentsText);
      }
    }
  }

  if (draft.name !== "submit_teaching_script" || !draft.argumentsText) {
    return [];
  }

  try {
    const parsed = JSON.parse(draft.argumentsText) as Record<string, unknown>;
    return parseTeachingScript(parsed);
  } catch {
    return [];
  }
}
