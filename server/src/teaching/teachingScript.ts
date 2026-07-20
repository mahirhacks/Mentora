import { formatBoardLayoutForPrompt } from "../../tools/boardLayout.js";
import {
  createBoardState,
  runTool,
  type BoardState,
} from "../../tools/index.js";
import {
  isSpeakDirective,
  speakDirectiveFromLegacyText,
  type SpeakDirective,
} from "../../voice/types.js";
import type { TeachingStep } from "./types.js";

function parseSpeakDirective(raw: Record<string, unknown>): SpeakDirective | null {
  const speech =
    raw.speech && typeof raw.speech === "object"
      ? (raw.speech as Record<string, unknown>)
      : raw;

  const legacyVoiceScript =
    typeof speech.voice_script === "string"
      ? speech.voice_script
      : typeof speech.voiceScript === "string"
        ? speech.voiceScript
        : typeof speech.text === "string"
          ? speech.text
          : "";

  const legacyMustSay = Array.isArray(speech.must_say ?? speech.mustSay)
    ? ((speech.must_say ?? speech.mustSay) as string[]).join(" ")
    : "";

  const candidate: SpeakDirective = {
    speechId: String(speech.speech_id ?? speech.speechId ?? ""),
    voiceScript: (legacyVoiceScript || legacyMustSay).trim(),
    boardObjectIds: Array.isArray(
      speech.board_references ?? speech.boardObjectIds,
    )
      ? ((speech.board_references ?? speech.boardObjectIds) as string[])
      : [],
    finalQuestion:
      speech.question === undefined
        ? ((speech.finalQuestion as string | null) ?? null)
        : (speech.question as string | null),
  };

  return isSpeakDirective(candidate) ? candidate : null;
}

export function parseTeachingStep(
  raw: Record<string, unknown>,
): TeachingStep | null {
  const stepType = raw.step_type;

  if (stepType === "speak") {
    const directive = parseSpeakDirective(raw);
    if (!directive) {
      const legacyText = typeof raw.text === "string" ? raw.text.trim() : "";
      if (!legacyText) {
        return null;
      }
      const legacyDirective = speakDirectiveFromLegacyText(legacyText);
      return {
        kind: "speak",
        directive: legacyDirective,
        text: legacyText,
      };
    }

    return {
      kind: "speak",
      directive,
      text: directive.finalQuestion ?? directive.voiceScript,
    };
  }

  if (stepType === "observe") {
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    const boardObjectIds = Array.isArray(raw.board_references)
      ? raw.board_references.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : undefined;
    return text ? { kind: "observe", text, boardObjectIds } : null;
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
