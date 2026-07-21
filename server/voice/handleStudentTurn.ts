import OpenAI from "openai";
import type { TeachingSession } from "../src/teaching/session.js";
import {
  streamTeachingScriptResult,
  type TeachingPlanner,
} from "../src/teaching/planner.js";
import {
  prepareTeachingTurn,
  type PreparedTeachingTurn,
  type PreparationIssue,
} from "../src/teaching/prepareTeachingTurn.js";
import type { TeachingScriptValidationResult } from "../src/teaching/teachingScript.js";
import type {
  LessonEvent,
  TeachingStep,
} from "../src/teaching/types.js";
import { buildVerifiedObservation } from "./observation.js";
import type {
  HandleStudentTurnOptions,
  SpeakDirective,
  StudentTurn,
  VoicePerformer,
  VoiceInterpreterInput,
} from "./types.js";
import { summarizeObservationForPrompt } from "./types.js";
import { Transcriber } from "./transcriber.js";

const VISUAL_REVEAL_DELAY_MS = 180;
const MAX_SPEECH_PACING_MS = 12_000;
const TURN_DEADLINE_MS = 45_000;

function abortableDelay(ms: number, signal?: AbortSignal) {
  if (ms <= 0 || signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(finish, ms);
    const onAbort = () => finish();

    function finish() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function audioDurationMs(audioBase64: string) {
  const pcmBytes = Buffer.byteLength(audioBase64, "base64");
  return Math.ceil((pcmBytes / 2 / 24_000) * 1_000);
}

function captionDurationMs(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(600, Math.ceil((words / 2.5) * 1_000));
}

export function spokenDirectiveText(directive: SpeakDirective) {
  const question = directive.finalQuestion?.trim();
  const script = directive.voiceScript.trim();

  if (!question) {
    return script;
  }
  if (!script) {
    return question;
  }

  const scriptLower = script.toLocaleLowerCase();
  const questionLower = question.toLocaleLowerCase();

  // Exact (or substring) match — already asked once.
  if (scriptLower.includes(questionLower)) {
    return script;
  }

  // voice_script already ends with a check question; don't append a
  // reworded duplicate from the question field.
  if (/\?\s*$/.test(script)) {
    return script;
  }

  return `${script} ${question}`.trim();
}

function isSpeakStep(
  step: TeachingStep,
): step is Extract<TeachingStep, { kind: "speak" }> {
  return step.kind === "speak";
}

function formatPreparationIssues(issues: PreparationIssue[]) {
  return issues
    .map(
      (issue) =>
        `step ${issue.stepIndex + 1} [${issue.code}]: ${issue.message}`,
    )
    .join("\n");
}

function formatValidationIssues(
  issues: Array<{
    stepIndex?: number;
    field: string;
    code: string;
    message: string;
  }>,
) {
  return issues
    .map((issue) => {
      const step =
        issue.stepIndex === undefined ? "script" : `step ${issue.stepIndex + 1}`;
      return `${step}.${issue.field} [${issue.code}]: ${issue.message}`;
    })
    .join("\n");
}

/**
 * Canonical student-turn entry point.
 * Voice and chat both normalize to text, then share the same decision model.
 */
export function normalizeStudentTurn(
  source: HandleStudentTurnOptions["source"],
  text: string,
): StudentTurn {
  const canonicalText = text.trim();
  if (!canonicalText) {
    throw new Error("Student turn text is required.");
  }

  return { source, text: canonicalText };
}

export async function* handleStudentTurn(input: {
  session: TeachingSession;
  openai: OpenAI;
  plannerModel: string;
  turnId: string;
  turn: StudentTurn;
  planner?: TeachingPlanner;
  voiceAssistant?: VoicePerformer;
  enableVoice?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<LessonEvent> {
  const {
    session,
    openai,
    plannerModel,
    turnId,
    turn,
    planner,
    voiceAssistant,
    enableVoice = false,
    signal: externalSignal,
  } = input;
  const deadlineSignal = AbortSignal.timeout(TURN_DEADLINE_MS);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, deadlineSignal])
    : deadlineSignal;
  const stopForAbort = () => {
    if (!signal.aborted) {
      return false;
    }
    session.discardLastUserPrompt();
    session.finishTurn(turnId);
    if (!externalSignal?.aborted) {
      throw new Error("The teaching turn timed out.");
    }
    return true;
  };

  if (!session.isTurnActive(turnId)) {
    session.beginTurn(turnId);
  }
  session.refreshSystemPrompt();
  session.addUserPrompt(turn.text);

  yield { type: "planning" };

  if (stopForAbort()) {
    return;
  }

  const plan: TeachingPlanner =
    planner ??
    ((plannerInput) =>
      streamTeachingScriptResult(
        openai,
        plannerModel,
        plannerInput.session,
        undefined,
        {
          signal: plannerInput.signal,
          validationFeedback: plannerInput.validationFeedback,
        },
      ));

  let planResult: TeachingScriptValidationResult;
  try {
    planResult = await plan({ session, signal });
  } catch (error) {
    if (externalSignal?.aborted) {
      session.discardLastUserPrompt();
      session.finishTurn(turnId);
      return;
    }
    if (deadlineSignal.aborted) {
      throw new Error("The teaching turn timed out.");
    }
    throw error;
  }
  let prepared: PreparedTeachingTurn | null = null;
  let lastStructurallyValidScript: TeachingStep[] | null = null;
  let repairFeedback = "";

  if (planResult.ok) {
    lastStructurallyValidScript = planResult.value;
    const preparation = prepareTeachingTurn(
      planResult.value,
      session.boardState,
      { resolveOccupiedOverlays: true },
    );
    if (preparation.ok) {
      prepared = preparation.turn;
    } else {
      repairFeedback = formatPreparationIssues(preparation.issues);
    }
  } else {
    repairFeedback = formatValidationIssues(planResult.issues);
  }

  if (!prepared && !signal?.aborted) {
    try {
      planResult = await plan({
        session,
        signal,
        validationFeedback: repairFeedback,
      });
    } catch (error) {
      if (externalSignal?.aborted) {
        session.discardLastUserPrompt();
        session.finishTurn(turnId);
        return;
      }
      if (deadlineSignal.aborted) {
        throw new Error("The teaching turn timed out.");
      }
      throw error;
    }

    if (planResult.ok) {
      lastStructurallyValidScript = planResult.value;
      const preparation = prepareTeachingTurn(
        planResult.value,
        session.boardState,
        { resolveOccupiedOverlays: true },
      );
      if (preparation.ok) {
        prepared = preparation.turn;
      } else {
        repairFeedback = formatPreparationIssues(preparation.issues);
      }
    } else {
      repairFeedback = formatValidationIssues(planResult.issues);
    }
  }

  if (stopForAbort()) {
    return;
  }

  if (!prepared && lastStructurallyValidScript) {
    const occupiedSpaceFallback = prepareTeachingTurn(
      lastStructurallyValidScript,
      session.boardState,
      { resolveOccupiedOverlays: true },
    );
    if (occupiedSpaceFallback.ok) {
      prepared = occupiedSpaceFallback.turn;
    }
  }

  if (stopForAbort()) {
    return;
  }

  if (!prepared) {
    console.warn(
      "[mentora] teaching turn fell back to safe speech; prep/validation failed:\n" +
        (repairFeedback || "no repair feedback available"),
    );
    const fallbackStep: TeachingStep = {
      kind: "speak",
      directive: {
        speechId: `safe_board_fallback_${turnId}`,
        voiceScript:
          "I couldn't finish that visual safely on this turn.",
        boardObjectIds: [],
        finalQuestion: "Ask me again and I'll redraw the next example.",
      },
    };
    prepared = {
      script: [fallbackStep],
      steps: [
        {
          index: 0,
          step: fallbackStep,
          boardStateAfter: structuredClone(session.boardState),
        },
      ],
      finalBoardState: structuredClone(session.boardState),
    };
  }

  try {
    yield* playTeachingScriptWithVoice({
      session,
      preparedTurn: prepared,
      turnId,
      studentMessage: turn.text,
      voiceAssistant,
      enableVoice,
      signal,
    });
    if (deadlineSignal.aborted && !externalSignal?.aborted) {
      throw new Error("The teaching turn timed out.");
    }
  } finally {
    session.finishTurn(turnId);
  }
}

export async function* playTeachingScriptWithVoice(input: {
  session: TeachingSession;
  preparedTurn: PreparedTeachingTurn;
  turnId: string;
  studentMessage: string;
  voiceAssistant?: VoicePerformer;
  enableVoice?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<LessonEvent> {
  const {
    session,
    preparedTurn,
    turnId,
    studentMessage,
    voiceAssistant,
    enableVoice = false,
    signal,
  } = input;

  const executionResults = [];
  let lastVerifiedObservation = buildVerifiedObservation(session.boardState);

  for (const preparedStep of preparedTurn.steps) {
    if (signal?.aborted) {
      return;
    }

    const { index, step } = preparedStep;
    let pacingMs = step.kind === "tool" ? VISUAL_REVEAL_DELAY_MS : 0;
    yield { type: "step", index, step };

    if (step.kind === "tool") {
      if (
        !session.commitPreparedBoard(
          turnId,
          preparedStep.boardStateAfter,
        )
      ) {
        return;
      }
      const result = {
        stepIndex: index,
        step,
        ok: true,
        result: preparedStep.toolResult,
      };
      executionResults.push(result);

      yield {
        type: "tool_result",
        index,
        ok: result.ok,
        result: result.result,
        boardState: structuredClone(session.boardState),
      };

      lastVerifiedObservation = buildVerifiedObservation(session.boardState);
    }

    if (step.kind === "observe") {
      lastVerifiedObservation = buildVerifiedObservation(
        session.boardState,
        step.boardObjectIds,
      );

      yield {
        type: "observe_context",
        index,
        context: lastVerifiedObservation.layoutSummary,
        observation: lastVerifiedObservation,
      };
    }

    if (isSpeakStep(step)) {
      const directive = step.directive;
      const voiceScript = spokenDirectiveText(directive);
      const observation = buildVerifiedObservation(
        session.boardState,
        directive.boardObjectIds,
      );

      const interpreterInput: VoiceInterpreterInput = {
        userPrompt: studentMessage,
        observation: summarizeObservationForPrompt(observation),
      };

      let naturalText = voiceScript;

      if (enableVoice && voiceAssistant) {
        const interpretation = await voiceAssistant.interpretSpeech(
          interpreterInput,
          { script: voiceScript, signal },
        );
        naturalText = interpretation.naturalText;

        yield {
          type: "speech_interpreted",
          index,
          speechId: directive.speechId,
          naturalText,
          transcriptSource: interpretation.transcriptFromVoiceModel
            ? "voice_model"
            : "fallback",
          directive,
        };

        if (interpretation.audioBase64 && interpretation.mimeType) {
          pacingMs = audioDurationMs(interpretation.audioBase64);
          yield {
            type: "voice_audio",
            index,
            speechId: directive.speechId,
            audioBase64: interpretation.audioBase64,
            mimeType: interpretation.mimeType,
          };
        } else {
          pacingMs = captionDurationMs(naturalText);
        }
      } else {
        yield {
          type: "speech_interpreted",
          index,
          speechId: directive.speechId,
          naturalText,
          transcriptSource: "fallback",
          directive,
        };
      }
    }

    await abortableDelay(
      Math.min(pacingMs, MAX_SPEECH_PACING_MS),
      signal,
    );
  }

  if (signal?.aborted || !session.isTurnActive(turnId)) {
    return;
  }

  session.addScriptTurn(preparedTurn.script, executionResults);

  yield {
    type: "done",
    script: preparedTurn.script,
    boardState: structuredClone(session.boardState),
  };
}

export async function transcribeStudentAudio(input: {
  openai: OpenAI;
  audio: Buffer;
  filename?: string;
  mimeType?: string;
  transcriberModel?: string;
}): Promise<StudentTurn> {
  const transcriber = new Transcriber(input.openai, {
    model: input.transcriberModel,
  });

  const result = await transcriber.transcribe(
    input.audio,
    input.filename,
    input.mimeType,
  );

  return normalizeStudentTurn("voice", result.text);
}

export function directivePreviewText(directive: SpeakDirective): string {
  if (directive.finalQuestion) {
    return directive.finalQuestion;
  }

  return directive.voiceScript;
}
