import type OpenAI from "openai";
import {
  createBoardState,
  runTool,
  type BoardState,
} from "../../tools/index.js";
import { canvasBoundaryGuide } from "../../tools/boundsGuard.js";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  formatBoardStateForPrompt,
} from "../../tools/boardLayout.js";
import type { TeachingStep } from "./types.js";
import { boardToolSchemasForPrompt } from "./openaiTools.js";

export interface ScriptExecutionResult {
  stepIndex: number;
  step: TeachingStep;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export class TeachingSession {
  readonly messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  boardState: BoardState = createBoardState();

  constructor(private readonly systemPrompt: string) {
    this.messages.push({ role: "system", content: this.systemPrompt });
  }

  reset() {
    this.messages.length = 0;
    this.messages.push({ role: "system", content: this.systemPrompt });
    this.boardState = createBoardState();
  }

  refreshSystemPrompt() {
    this.messages[0] = {
      role: "system",
      content: buildSystemPrompt(this.boardState),
    };
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
        content: `Tool execution results:\n${JSON.stringify(toolResults, null, 2)}`,
      });
    }
  }

  executeToolStep(
    stepIndex: number,
    step: Extract<TeachingStep, { kind: "tool" }>,
  ): ScriptExecutionResult {
    const outcome = runTool(step.toolName, step.input, this.boardState);
    return {
      stepIndex,
      step,
      ok: outcome.ok,
      result: outcome.ok ? outcome.result : undefined,
      error: outcome.ok ? undefined : outcome.error,
    };
  }
}

export function buildSystemPrompt(boardState: BoardState): string {
  const toolGuide = boardToolSchemasForPrompt
    .map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\n  input: ${JSON.stringify(tool.inputSchema)}`,
    )
    .join("\n");

  return `
You are Mentora's teaching brain and lesson-script director.

You do not directly speak or draw.
A separate voice system speaks each "speak" step.
A deterministic canvas executor performs each "tool" step.

You MUST call submit_teaching_script exactly once.
Do not return ordinary prose outside that tool call.

## Canvas

- Size: ${BOARD_WIDTH} x ${BOARD_HEIGHT} pixels
- Origin: top-left corner is (0, 0)
- x increases to the right, y increases downward

${canvasBoundaryGuide()}

## Board awareness

Before every tool step:
1. Read the layout catalog below.
2. Reuse existing object ids when updating the same concept.
3. Place new content in open space using the catalog to avoid overlap.
4. Leave at least 24px between unrelated text blocks.
5. Stack code or text lines vertically with at least 36px between baselines.
6. Use erase_object to remove outdated or unimportant objects before drawing replacements.
7. Use reset_board to wipe the entire canvas when starting a completely new diagram or topic.
8. The board executor also auto-clears overlapping text, labels, highlights, and pointers when placing new content in the same area. Shapes and diagram structure are preserved unless explicitly erased.

Good reasons to erase:
- old helper labels no longer needed
- temporary highlights or pointers
- duplicate text from a previous step
- clutter blocking the next diagram

## Your task

Create ONE SHORT TEACHING TURN for the student's current request.

## Step types

### speak
Words Mentora will say aloud. Short sentences only.

### tool
One deterministic board action using one available board tool.

### observe
An INTERNAL assertion about what must exist on the board after drawing.
Observe steps are NOT spoken aloud.

## Script size

- Target 4 to 10 total steps.
- Hard maximum: 12 steps.
- The final step MUST be a speak step with one clear question.

## Available board tools

${toolGuide}

## Current board state and layout catalog

${formatBoardStateForPrompt(boardState)}
`.trim();
}
