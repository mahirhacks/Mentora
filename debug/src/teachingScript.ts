import type { BoardState } from "../../server/tools/index.js";
import { createBoardState, runTool } from "../../server/tools/index.js";

export type TeachingStep =
  | { kind: "speak"; text: string }
  | { kind: "tool"; toolName: string; input: Record<string, unknown> }
  | { kind: "observe"; text: string };

export interface RawTeachingStepInput {
  step_type: "speak" | "tool" | "observe";
  text?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
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

export function parseTeachingStep(
  raw: Record<string, unknown>,
): TeachingStep | null {
  const stepType = raw.step_type;
  if (stepType === "speak") {
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text) {
      return null;
    }
    return { kind: "speak", text };
  }

  if (stepType === "observe") {
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text) {
      return null;
    }
    return { kind: "observe", text };
  }

  if (stepType === "tool") {
    const toolName =
      typeof raw.tool_name === "string" ? raw.tool_name.trim() : "";
    const toolInput =
      raw.tool_input && typeof raw.tool_input === "object"
        ? (raw.tool_input as Record<string, unknown>)
        : {};
    if (!toolName) {
      return null;
    }
    return { kind: "tool", toolName, input: toolInput };
  }

  return null;
}

export function summarizeBoardState(state: BoardState): string {
  const objects = Object.values(state.objects);
  if (objects.length === 0) {
    return "The board is empty.";
  }

  return objects
    .map((object) => {
      if (object.kind === "shape") {
        return `- ${object.id}: ${object.shape} at (${object.bounds.x}, ${object.bounds.y})`;
      }
      if (object.kind === "text" || object.kind === "label") {
        return `- ${object.id}: ${object.kind} "${object.text}"`;
      }
      if (object.kind === "division") {
        return `- ${object.id}: division slice #${object.regionIndex + 1} of ${object.parentId}`;
      }
      if (object.kind === "highlight") {
        return `- ${object.id}: highlight on ${object.targetId}`;
      }
      if (object.kind === "pointer") {
        return `- ${object.id}: pointer${object.label ? ` "${object.label}"` : ""}`;
      }
      return `- ${object.id}: ${object.kind}`;
    })
    .join("\n");
}

export function countToolSteps(steps: TeachingStep[]): number {
  return steps.filter((step) => step.kind === "tool").length;
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
