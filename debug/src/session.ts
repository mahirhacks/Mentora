import type OpenAI from "openai";
import {
  createBoardState,
  runTool,
  type BoardState,
} from "../../server/tools/index.js";
import { buildSystemPrompt as buildProductionSystemPrompt } from "../../server/src/teaching/session.js";
import type { TeachingStep } from "./teachingScript.js";

export interface ScriptExecutionResult {
  stepIndex: number;
  step: TeachingStep;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export class DebugSession {
  readonly messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  boardState: BoardState = createBoardState();
  autoExecute = false;
  lastScript: TeachingStep[] = [];

  constructor(private readonly systemPrompt: string) {
    this.messages.push({ role: "system", content: this.systemPrompt });
  }

  reset() {
    this.messages.length = 0;
    this.messages.push({ role: "system", content: this.systemPrompt });
    this.boardState = createBoardState();
    this.lastScript = [];
  }

  addUserPrompt(prompt: string) {
    this.messages.push({ role: "user", content: prompt });
  }

  addScriptTurn(
    steps: TeachingStep[],
    executionResults: ScriptExecutionResult[],
  ) {
    if (steps.length === 0) {
      return;
    }

    this.messages.push({
      role: "assistant",
      content: JSON.stringify(
        {
          teaching_script: steps.map((step, index) => ({
            index: index + 1,
            ...step,
          })),
          board_revision: this.boardState.revision,
        },
        null,
        2,
      ),
    });

    const toolResults = executionResults.filter(
      (entry) => entry.step.kind === "tool",
    );
    if (toolResults.length > 0) {
      this.messages.push({
        role: "user",
        content: `Tool execution results from the lesson script:\n${JSON.stringify(toolResults, null, 2)}`,
      });
    }
  }

  executeScript(steps: TeachingStep[]): ScriptExecutionResult[] {
    const results: ScriptExecutionResult[] = [];

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (step.kind !== "tool") {
        continue;
      }

      const outcome = runTool(step.toolName, step.input, this.boardState);
      results.push({
        stepIndex: index,
        step,
        ok: outcome.ok,
        result: outcome.ok ? outcome.result : undefined,
        error: outcome.ok ? undefined : outcome.error,
      });
    }

    return results;
  }
}

export function buildSystemPrompt(boardState: BoardState): string {
  return buildProductionSystemPrompt(boardState);
}
