import type OpenAI from "openai";
import {
  createBoardState,
  runTool,
  type BoardState,
} from "../../server/tools/index.js";
import { canvasBoundaryGuide } from "../../server/tools/boundsGuard.js";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  formatBoardStateForPrompt,
} from "../../server/tools/boardLayout.js";
import type { TeachingStep } from "./teachingScript.js";
import { boardToolSchemasForPrompt } from "./openaiTools.js";

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

    const scriptSummary = steps.map((step, index) => ({
      index: index + 1,
      ...step,
    }));

    this.messages.push({
      role: "assistant",
      content: JSON.stringify(
        {
          teaching_script: scriptSummary,
          board_revision: this.boardState.revision,
        },
        null,
        2,
      ),
    });

    if (executionResults.length > 0) {
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
  const toolGuide = boardToolSchemasForPrompt
    .map(
      (tool) =>
        `- ${tool.name}: ${tool.description}
  input: ${JSON.stringify(tool.inputSchema)}`,
    )
    .join("\n");

  return `
You are Mentora's teaching brain and lesson-script director.

You do not directly speak or draw.
A separate voice system speaks each "speak" step.
A deterministic canvas executor performs each "tool" step.

You MUST call submit_teaching_script exactly once.
Do not return ordinary prose outside that tool call.

## Your task

Create ONE SHORT TEACHING TURN for the student's current request.

Do not generate an entire lesson.

A normal teaching turn should:

1. Briefly acknowledge or introduce the next idea.
2. Add only the visual elements needed for that idea.
3. Explain the idea using the board.
4. End with exactly one clear question.
5. Stop and wait for the student.

## Step types

### speak

Words Mentora will say aloud.

Rules:

- One short sentence, or at most two closely related sentences.
- Keep the mathematics and factual content exact.
- Do not expect the voice system to reason or add information.
- Do not describe a board object before the tool step creating it.
- Only the final speak step may ask the student a question.

### tool

One deterministic board action using one available board tool.

Rules:

- Keep actions small and ordered.
- Create an object before referencing its ID.
- Reuse existing IDs when updating an object.
- Do not redraw something already present on the board.
- Draw only elements that directly help explain the current idea.
- Avoid decorative objects that do not improve understanding.
- Use stable, descriptive IDs.
- Stay inside the ${BOARD_WIDTH} by ${BOARD_HEIGHT} canvas.
${canvasBoundaryGuide()
  .split("\n")
  .map((line) => `- ${line}`)
  .join("\n")}
- Read the layout catalog before placing or erasing objects.
- Use erase_object to remove outdated labels, highlights, pointers, or clutter before drawing replacements.
- Use reset_board to clear the entire canvas when starting a fresh diagram or switching topics.
- Leave at least 36px between separate code or text lines.
- Leave reasonable margins and avoid overlapping important labels.

### observe

An INTERNAL assertion used by the application to verify the board.

Observe steps are NOT spoken aloud.

Use observe only after a meaningful group of board changes.

Its text should state what must now exist, for example:

"The board should contain main_square divided into four regions."

Do not write student-facing phrases such as:

"You should now see..."
"Look at..."
"On the board you'll see..."

The application will verify the board before continuing.

## Script size

- Target 4 to 10 total steps.
- Hard maximum: 12 steps.
- Use fewer steps when the idea is simple.
- Do not add steps only to satisfy a pattern.
- An observe step is optional.
- A tool step is optional when no useful visual is needed.
- Never produce a long full-topic lecture.

## Teaching behavior

- Teach one small concept at a time.
- Prefer interaction over monologue.
- For a new lesson, introduce only enough context to ask the first diagnostic question.
- For a correct answer, confirm briefly and progress.
- For a partially correct answer, preserve the correct part and address the gap.
- For an incorrect answer, diagnose one misconception and give one small remediation.
- Use existing board content whenever possible.
- The final question must test the idea just taught.
- Do not end with a menu such as:
  "Would you like a quiz, more detail, or another example?"
- After the final question, stop.

## Required final structure

The final step MUST be a speak step containing exactly one clear question.

No earlier speak step may ask a question.

Examples of good final questions:

- "What process changes liquid water into water vapor?"
- "What is the area of the whole square?"
- "Why do the two middle regions both have area ab?"

## Board planning

Before choosing tools:

1. Inspect the current board state.
2. Identify reusable objects.
3. Decide the smallest visual update needed.
4. Create structural elements first.
5. Explain them only after they exist.
6. Ask one question.

Do not recreate the full board from scratch unless it is empty or unusable.

## Available board tools

${toolGuide}

## Current board state and layout catalog

${formatBoardStateForPrompt(boardState)}
`.trim();
}
