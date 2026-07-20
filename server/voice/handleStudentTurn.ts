import OpenAI from "openai";
import type { TeachingSession } from "../src/teaching/session.js";
import { streamTeachingScript } from "../src/teaching/planner.js";
import type { LessonEvent, TeachingStep } from "../src/teaching/types.js";
import { buildVerifiedObservation } from "./observation.js";
import type {
  HandleStudentTurnOptions,
  SpeakDirective,
  StudentTurn,
  VoiceInterpreterInput,
} from "./types.js";
import { summarizeObservationForPrompt } from "./types.js";
import { Transcriber } from "./transcriber.js";
import { VoiceAssistant } from "./voiceAssistant.js";

const STEP_DELAY_MS = 700;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSpeakStep(
  step: TeachingStep,
): step is Extract<TeachingStep, { kind: "speak" }> {
  return step.kind === "speak";
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
  turn: StudentTurn;
  voiceAssistant?: VoiceAssistant;
  enableVoice?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<LessonEvent> {
  const {
    session,
    openai,
    plannerModel,
    turn,
    voiceAssistant,
    enableVoice = false,
    signal,
  } = input;

  session.refreshSystemPrompt();
  session.addUserPrompt(turn.text);

  yield { type: "planning" };

  if (signal?.aborted) {
    return;
  }

  const script = await streamTeachingScript(openai, plannerModel, session);
  if (script.length === 0) {
    yield {
      type: "error",
      message: "No teaching script was generated.",
    };
    return;
  }

  yield* playTeachingScriptWithVoice({
    session,
    script,
    studentMessage: turn.text,
    voiceAssistant,
    enableVoice,
    signal,
  });
}

export async function* playTeachingScriptWithVoice(input: {
  session: TeachingSession;
  script: TeachingStep[];
  studentMessage: string;
  voiceAssistant?: VoiceAssistant;
  enableVoice?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<LessonEvent> {
  const {
    session,
    script,
    studentMessage,
    voiceAssistant,
    enableVoice = false,
    signal,
  } = input;

  const executionResults = [];
  let lastVerifiedObservation = buildVerifiedObservation(session.boardState);

  for (let index = 0; index < script.length; index += 1) {
    if (signal?.aborted) {
      voiceAssistant?.cancel();
      return;
    }

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

      if (!result.ok) {
        yield {
          type: "error",
          message: result.error ?? `Tool step failed: ${step.toolName}`,
        };
        return;
      }

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
      const observation = buildVerifiedObservation(
        session.boardState,
        directive.boardObjectIds,
      );

      const interpreterInput: VoiceInterpreterInput = {
        userPrompt: studentMessage,
        observation: summarizeObservationForPrompt(observation),
      };

      let naturalText = directive.voiceScript;

      if (enableVoice && voiceAssistant) {
        const interpretation = await voiceAssistant.interpretSpeech(
          interpreterInput,
          { script: directive.voiceScript, signal },
        );
        naturalText = interpretation.naturalText;

        yield {
          type: "speech_interpreted",
          index,
          speechId: directive.speechId,
          naturalText,
          directive,
        };

        if (interpretation.audioBase64 && interpretation.mimeType) {
          yield {
            type: "voice_audio",
            index,
            speechId: directive.speechId,
            audioBase64: interpretation.audioBase64,
            mimeType: interpretation.mimeType,
          };
        }
      } else {
        yield {
          type: "speech_interpreted",
          index,
          speechId: directive.speechId,
          naturalText,
          directive,
        };
      }
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
