import OpenAI from "openai";
import { createBoardState } from "../../server/tools/index.js";
import { toOpenAiTools } from "./openaiTools.js";
import type { DebugSession } from "./session.js";
import {
  parseTeachingScript,
  projectBoardThroughStep,
  summarizeBoardState,
  type TeachingStep,
} from "./teachingScript.js";
import {
  color,
  error,
  info,
  inline,
  jsonBlock,
  section,
  success,
  warn,
} from "./terminalUi.js";

interface ToolCallDraft {
  id: string;
  name: string;
  argumentsText: string;
}

type StreamDelta = OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
  reasoning_content?: string;
};

export async function streamTeachingScript(
  client: OpenAI,
  model: string,
  session: DebugSession,
): Promise<{
  assistantText: string;
  reasoningText: string;
  script: TeachingStep[];
}> {
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

  let assistantText = "";
  let reasoningText = "";
  let draft: ToolCallDraft = { id: "", name: "", argumentsText: "" };
  let printedReasoningHeader = false;
  let printedNotesHeader = false;
  let printedScriptHeader = false;

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) {
      continue;
    }

    const delta = choice.delta as StreamDelta;

    if (delta.reasoning_content) {
      if (!printedReasoningHeader) {
        section("Reasoning (live)");
        printedReasoningHeader = true;
      }
      reasoningText += delta.reasoning_content;
      inline(color(delta.reasoning_content, "magenta"));
    }

    if (delta.content) {
      if (!printedNotesHeader) {
        section("Planner notes (live)");
        printedNotesHeader = true;
      }
      assistantText += delta.content;
      inline(color(delta.content, "green"));
    }

    if (delta.tool_calls) {
      for (const toolDelta of delta.tool_calls) {
        if (toolDelta.id) {
          draft.id = toolDelta.id;
        }
        if (toolDelta.function?.name) {
          draft.name = toolDelta.function.name;
        }
        if (toolDelta.function?.arguments) {
          if (!printedScriptHeader) {
            println();
            section("Teaching script (streaming)");
            printedScriptHeader = true;
          }
          draft.argumentsText += toolDelta.function.arguments;
          inline(color(toolDelta.function.arguments, "yellow"));
        }
      }
    }
  }

  println();

  let script: TeachingStep[] = [];
  if (draft.name === "submit_teaching_script" && draft.argumentsText) {
    try {
      const parsed = JSON.parse(draft.argumentsText) as Record<string, unknown>;
      script = parseTeachingScript(parsed);
    } catch {
      warn("Could not parse the teaching script payload.");
    }
  }

  return { assistantText, reasoningText, script };
}

export function printTeachingScript(
  script: TeachingStep[],
  boardState = createBoardState(),
) {
  if (script.length === 0) {
    warn("No teaching script was prepared.");
    return;
  }

  section("Teaching script");
  for (const [index, step] of script.entries()) {
    printTeachingStep(index + 1, step, script, index, boardState);
  }
}

export function printTeachingStep(
  number: number,
  step: TeachingStep,
  script: TeachingStep[],
  stepIndex: number,
  initialBoardState: Parameters<typeof projectBoardThroughStep>[2],
) {
  if (step.kind === "speak") {
    console.log(color(`\n${number}. SPEAK`, "green"));
    console.log(color(`   🗣  "${step.text}"`, "green"));
    return;
  }

  if (step.kind === "observe") {
    const projected = projectBoardThroughStep(
      script,
      stepIndex - 1,
      initialBoardState,
    );
    console.log(color(`\n${number}. OBSERVE`, "cyan"));
    info("   📋 Simulated canvas context:");
    for (const line of summarizeBoardState(projected).split("\n")) {
      info(`      ${line}`);
    }
    console.log(color(`   🗣  "${step.text}"`, "cyan"));
    return;
  }

  console.log(color(`\n${number}. TOOL → ${step.toolName}`, "yellow"));
  jsonBlock(step.input);
}

export function playTeachingScript(
  session: DebugSession,
  script: TeachingStep[],
  executeTools: boolean,
) {
  section(
    executeTools ? "Playing lesson script (with execution)" : "Teaching script",
  );

  const results = executeTools ? session.executeScript(script) : [];

  for (const [index, step] of script.entries()) {
    printTeachingStep(index + 1, step, script, index, session.boardState);

    if (!executeTools || step.kind !== "tool") {
      continue;
    }

    const result = results.find((entry) => entry.stepIndex === index);
    if (!result) {
      continue;
    }

    if (result.ok) {
      success("   ✓ executed");
      jsonBlock(result.result);
    } else {
      error(`   ✗ ${result.error}`);
    }
  }

  return results;
}

export function printScriptExecutionResults(
  results: Array<{
    stepIndex: number;
    step: TeachingStep;
    ok: boolean;
    result?: unknown;
    error?: string;
  }>,
) {
  const toolResults = results.filter((entry) => entry.step.kind === "tool");
  if (toolResults.length === 0) {
    return;
  }

  section("Tool execution results");
  for (const entry of toolResults) {
    if (entry.step.kind !== "tool") {
      continue;
    }
    if (entry.ok) {
      success(`✓ Step ${entry.stepIndex + 1}: ${entry.step.toolName}`);
      jsonBlock(entry.result);
    } else {
      error(
        `✗ Step ${entry.stepIndex + 1}: ${entry.step.toolName} — ${entry.error}`,
      );
    }
  }
}

function println(text = "") {
  console.log(text);
}
