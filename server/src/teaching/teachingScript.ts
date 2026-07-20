import {
  formatBoardLayoutForPrompt,
} from "../../tools/boardLayout.js";
import {
  createBoardState,
  runTool,
  type BoardState,
} from "../../tools/index.js";
import type { TeachingStep } from "./types.js";
export function parseTeachingStep(
  raw: Record<string, unknown>,
): TeachingStep | null {
  const stepType = raw.step_type;
  if (stepType === "speak") {
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    return text ? { kind: "speak", text } : null;
  }

  if (stepType === "observe") {
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    return text ? { kind: "observe", text } : null;
  }

  if (stepType === "tool") {
    const toolName =
      typeof raw.tool_name === "string" ? raw.tool_name.trim() : "";
    const toolInput =
      raw.tool_input && typeof raw.tool_input === "object"
        ? (raw.tool_input as Record<string, unknown>)
        : {};
    return toolName ? { kind: "tool", toolName, input: toolInput } : null;
  }

  return null;
}

export function parseTeachingScript(
  raw: Record<string, unknown>,
): TeachingStep[] {
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const parsed: TeachingStep[] = [];

  for (const entry of steps) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const step = parseTeachingStep(entry as Record<string, unknown>);
    if (step) {
      parsed.push(step);
    }
  }

  return parsed;
}

export function summarizeBoardState(state: BoardState): string {
  return formatBoardLayoutForPrompt(state);
}

export function projectBoardThroughStep(
  script: TeachingStep[],
  throughIndex: number,
  initialState: BoardState = createBoardState(),
): BoardState {
  const projected = structuredClone(initialState);

  for (let index = 0; index <= throughIndex; index += 1) {
    const step = script[index];
    if (step?.kind === "tool") {
      runTool(step.toolName, step.input, projected);
    }
  }

  return projected;
}
