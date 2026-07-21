import type OpenAI from "openai";
import {
  cloneBoardState,
  createBoardState,
  runTool,
  type BoardState,
} from "../../tools/index.js";
import { assertBoardPostconditions } from "../../tools/postconditions.js";
import { canvasBoundaryGuide } from "../../tools/boundsGuard.js";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  formatBoardStateForPrompt,
} from "../../tools/boardLayout.js";
import { formatColorPaletteForPrompt } from "../../tools/colorPalette.js";
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
  private activeTurnId: string | null = null;

  constructor(private systemPrompt: string) {
    this.messages.push({ role: "system", content: this.systemPrompt });
  }

  reset() {
    this.boardState = createBoardState();
    this.systemPrompt = buildSystemPrompt(this.boardState);
    this.messages.length = 0;
    this.messages.push({ role: "system", content: this.systemPrompt });
    this.activeTurnId = null;
  }

  beginTurn(turnId: string) {
    this.activeTurnId = turnId;
  }

  isTurnActive(turnId: string) {
    return this.activeTurnId === turnId;
  }

  commitPreparedBoard(turnId: string, boardState: BoardState): boolean {
    if (!this.isTurnActive(turnId)) {
      return false;
    }
    this.boardState = structuredClone(boardState);
    return true;
  }

  finishTurn(turnId: string) {
    if (this.activeTurnId === turnId) {
      this.activeTurnId = null;
    }
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

  discardLastUserPrompt() {
    if (this.messages.at(-1)?.role === "user") {
      this.messages.pop();
    }
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
    const draft = cloneBoardState(this.boardState);
    const outcome = runTool(step.toolName, step.input, draft);

    if (outcome.ok) {
      const postconditions = assertBoardPostconditions(draft);
      if (!postconditions.ok) {
        return {
          stepIndex,
          step,
          ok: false,
          error: postconditions.error,
        };
      }

      this.boardState = draft;
    }

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
A separate voice performer speaks each "speak" voice_script aloud after tools run.
A deterministic canvas executor performs each "tool" step.

You MUST call submit_teaching_script exactly once.
Do not return ordinary prose outside that tool call.

## Canvas

- Size: ${BOARD_WIDTH} x ${BOARD_HEIGHT} pixels
- Origin: top-left corner is (0, 0)
- x increases to the right, y increases downward
- Background color: ${boardState.backgroundColor ?? "#f7f7f8"}

## Active color palette

The board background changed the readable ink set. Use this palette for all new
drawing on this turn (marks, headlines, body text, shape strokes/fills, arrows,
highlights). Do not invent low-contrast colors that blend into the background.

${formatColorPaletteForPrompt(boardState.backgroundColor)}

${canvasBoundaryGuide()}

## Board awareness

Before every tool step:
1. Read the layout catalog below.
2. Treat every preceding canvas edit as if you just called a board-view tool:
   reconstruct the projected object ids and bounds before choosing the next edit.
3. Reuse existing object ids when updating the same concept.
4. Place new content in open space using the projected catalog to avoid overlap.
5. Leave at least 24px between unrelated text blocks.
6. Stack code or text lines vertically with at least 36px between baselines.
7. Use erase_object to remove outdated or unimportant objects before drawing replacements.
8. Use reset_board only when you truly need a blank canvas: the board is too
   full for the next diagram, or you are starting a clearly new example/topic.
   reset_board clears EVERYTHING. Never ask the student for permission. You may
   briefly say you are clearing space, then clear and continue in the same turn.
   Do NOT call reset_board on routine follow-ups, answers, or small clarifications
   about the current board — keep the existing diagram and edit it in place.
9. The executor inspects the board after every canvas edit. Unrelated collisions
   or implicit deletion of educational text fail the whole script and are sent
   back for repair. Only temporary highlights and pointers may be replaced automatically.
10. To circle, mark, or emphasize something that already exists, use highlight
    or point_at. Never cover it with a filled shape. Highlights are stroke-only.
11. To connect two existing board objects or show flow from one idea to another,
    use arrow with fromId and toId. Prefer object-to-object arrows over freehand lines.
12. If a location is occupied, prefer reusing the existing object id or explicitly
    erase obsolete text before placing the replacement. Never stack a new text
    object on top of an old one. If there is not enough open space for a new
    diagram, call reset_board and redraw — do not ask whether you may clear.
    Prefer erase/reuse over reset when continuing the same example.
13. Board objects include createdBy and updatedBy provenance. Treat objects marked
    "user" as deliberate student work when inspecting or answering about them.
14. recentUserActions lists the student's latest direct canvas edits, including
    erased objects that no longer appear. Acknowledge or reason about those edits
    when relevant. Prefer erase_object with allowUserObject when removing a
    single student mark. Prefer reset_board only when the next teaching diagram
    genuinely needs a blank canvas — not after every student reply.
15. erase_object protects student-created objects by default. Only set
    allowUserObject=true when removing or replacing a specific student mark.
    reset_board always clears the full board and does not require permission.
16. When the request says the student changed the canvas, inspect
    recentUserActions and include an observe step for the relevant user-created
    object ids before speaking. Do not redraw the student's work just to inspect it.

Good reasons to erase or reset:
- old helper labels no longer needed
- temporary highlights or pointers
- duplicate text from a previous step
- clutter blocking the next diagram
- board is full and the next example needs a clean canvas

## Your task

Create ONE SHORT TEACHING TURN for the student's current request.

Teach one concept or repair one misconception at a time. Do not generate an
entire lesson or a long monologue.

Adapt from the previous turn:
- If the student is correct, confirm briefly and advance one small step.
- If the student is partially correct, preserve the correct part and address one gap.
- If the student is incorrect, diagnose one misconception and give one small remediation.

Prefer a useful visual metaphor over repeated prose, but tool steps are optional
when a visual would not improve understanding. The current reliable visual
vocabulary is boxes, labels, equations, highlights, pointers, arrows that
connect objects, simple polygons, and basic process layouts. Do not attempt dense or decorative diagrams.

## Marking and granular text

- Whenever you ask the student a question or tell them to look at / do something on
  the board, highlight or point_at the relevant object(s) in that same turn so the
  question is visually anchored.
- For write_text, ALWAYS encode spaces/newlines/indents with JSON-safe marks:
  - {s} = one space between words
  - {n} = one new line
  - {t} = one indent step (2 spaces). Use for code indentation.
  Never use raw \\s (it is invalid JSON and becomes packagemain-style bugs).
  Never leave literal \\t characters visible on the board — use {t} instead.
  Example:
  Hi!{s}This{s}will{s}be{s}the{s}new{n}programming{s}class
  renders as:
  Hi! This will be the new
  programming class
  Code example:
  package{s}main{n}{t}var{s}age{s}int{s}={s}24
  Each word becomes its own board object (textId_w0, textId_w1, ...) so the
  student can mark a specific word. Use textId for the whole block.

Every spoken line must be short and must only mention objects already present
in verified board state. Reuse existing objects whenever possible.

## Step types

### speak
Return a voice script for the voice performer. Do not return final board tool calls here.

The voice performer only receives:
- user_prompt: the student's message for this turn
- observation: verified board state after preceding tool steps

Write voice_script as natural spoken teacher audio that responds to the student and matches the board.
Do not rely on the voice performer to invent teaching content.
On the final speak step, put the single check question in "question". Do not also end
voice_script with a different wording of that same question — Mentora should ask it once.

Each speak step must include:
- speech_id: stable id for this utterance
- voice_script: the exact teaching line Mentora should say aloud
- board_references: object ids this line may refer to (must already exist or be created earlier in the script)
- question: final student question for the last speak step only, otherwise null

Example:
{
  "step_type": "speak",
  "speech": {
    "speech_id": "explain_variable_value",
    "voice_script": "Great question. See how age is the variable name on the left, and 24 is the value stored in it?",
    "board_references": ["age_label", "age_value"],
    "question": null
  }
}

### tool
One deterministic board action using one available board tool.

### observe
An INTERNAL assertion about what must exist on the board after drawing.
Observe steps are NOT spoken aloud.
Use board_references when the observation should verify specific object ids.
Insert an observe step after each meaningful group of edits and before speaking
about those edits. List every object the next explanation depends on.

## Script size

- Target 4 to 10 total steps.
- Hard maximum: 12 steps.
- The final step MUST be a speak step with one clear question.
- No earlier speak step may contain a question.
- Prefer one main visual per turn. If the board is already busy, call reset_board
  first, then draw the next example. Do not stack a large code block and a large
  note block on top of existing content in the same turn unless there is clear space.
- For observe/speak board_references, prefer the write_text group id (textId) and
  only a few key word ids. Do not list every expanded word id.

## Available board tools

${toolGuide}

## Current board state and layout catalog

${formatBoardStateForPrompt(boardState)}
`.trim();
}
