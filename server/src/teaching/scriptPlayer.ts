import type { TeachingSession } from "./session.js";
import { summarizeBoardState } from "./teachingScript.js";
import type { LessonEvent, TeachingStep } from "./types.js";

const STEP_DELAY_MS = 700;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* playTeachingScript(
  session: TeachingSession,
  script: TeachingStep[],
): AsyncGenerator<LessonEvent> {
  const executionResults = [];

  for (let index = 0; index < script.length; index += 1) {
    const step = script[index];
    yield { type: "step", index, step };

    if (step.kind === "tool") {
      const result = session.executeToolStep(index, step);
      executionResults.push(result);
      yield {
        type: "tool_result",
        index,
        ok: result.ok,
        result: result.result,
        error: result.error,
        boardState: structuredClone(session.boardState),
      };
    }

    if (step.kind === "observe") {
      yield {
        type: "observe_context",
        index,
        context: summarizeBoardState(session.boardState),
      };
    }

    if (step.kind === "speak") {
      yield {
        type: "speech_interpreted",
        index,
        speechId: step.directive.speechId,
        naturalText: step.text ?? step.directive.voiceScript,
        transcriptSource: "fallback",
        directive: step.directive,
      };
    }

    await delay(STEP_DELAY_MS);
  }

  session.addScriptTurn(script, executionResults);

  yield {
    type: "done",
    script,
    boardState: structuredClone(session.boardState),
  };
}
