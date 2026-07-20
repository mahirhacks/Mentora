import type { TeachingStep } from "../../server/src/teaching/types.js";

export {
  parseTeachingScript,
  parseTeachingStep,
  projectBoardThroughStep,
  summarizeBoardState,
  validateTeachingScriptPayload,
} from "../../server/src/teaching/teachingScript.js";
export type { TeachingStep };

export function countToolSteps(steps: TeachingStep[]): number {
  return steps.filter((step) => step.kind === "tool").length;
}
