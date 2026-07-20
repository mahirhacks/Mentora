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
  const result = validateTeachingScriptPayload(raw);
  return result.ok ? result.value : [];
}

export interface TeachingScriptValidationIssue {
  stepIndex?: number;
  field: string;
  code: string;
  message: string;
}

export type TeachingScriptValidationResult =
  | { ok: true; value: TeachingStep[] }
  | { ok: false; issues: TeachingScriptValidationIssue[] };

export function validateTeachingScriptPayload(
  raw: Record<string, unknown>,
): TeachingScriptValidationResult {
  if (!Array.isArray(raw.steps)) {
    return {
      ok: false,
      issues: [
        {
          field: "steps",
          code: "required",
          message: "steps must be an array.",
        },
      ],
    };
  }

  if (raw.steps.length < 3 || raw.steps.length > 12) {
    return {
      ok: false,
      issues: [
        {
          field: "steps",
          code: "step_count",
          message: "A teaching script must contain 3 to 12 steps.",
        },
      ],
    };
  }

  const parsed: TeachingStep[] = [];
  const issues: TeachingScriptValidationIssue[] = [];

  for (const [stepIndex, entry] of raw.steps.entries()) {
    if (!entry || typeof entry !== "object") {
      issues.push({
        stepIndex,
        field: "step",
        code: "invalid_step",
        message: "Each step must be an object.",
      });
      continue;
    }

    const rawStep = entry as Record<string, unknown>;
    if (
      rawStep.step_type === "speak" &&
      (!rawStep.speech || typeof rawStep.speech !== "object")
    ) {
      issues.push({
        stepIndex,
        field: "speech",
        code: "required",
        message: "Speak steps require a structured speech object.",
      });
      continue;
    }

    const step = parseTeachingStep(rawStep);
    if (!step) {
      issues.push({
        stepIndex,
        field: "step",
        code: "invalid_step",
        message: "Step fields do not match the selected step type.",
      });
      continue;
    }
    parsed.push(step);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const finalStep = parsed.at(-1);
  if (finalStep?.kind !== "speak") {
    issues.push({
      stepIndex: parsed.length - 1,
      field: "step_type",
      code: "final_step",
      message: "The final step must be a speak step.",
    });
  }

  const speechIds = new Set<string>();
  for (const [stepIndex, step] of parsed.entries()) {
    if (step.kind === "observe" && !step.boardObjectIds?.length) {
      issues.push({
        stepIndex,
        field: "board_references",
        code: "required",
        message: "Observe steps require at least one board reference.",
      });
    }

    if (step.kind !== "speak") {
      continue;
    }

    if (speechIds.has(step.directive.speechId)) {
      issues.push({
        stepIndex,
        field: "speech.speech_id",
        code: "duplicate",
        message: `Duplicate speech id: ${step.directive.speechId}`,
      });
    }
    speechIds.add(step.directive.speechId);

    const isFinal = stepIndex === parsed.length - 1;
    const question = step.directive.finalQuestion?.trim() ?? "";
    if (isFinal && !question) {
      issues.push({
        stepIndex,
        field: "speech.question",
        code: "final_question",
        message: "The final speak step requires one clear question.",
      });
    }
    if (!isFinal && step.directive.finalQuestion !== null) {
      issues.push({
        stepIndex,
        field: "speech.question",
        code: "early_question",
        message: "Only the final speak step may contain a question.",
      });
    }
  }

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: parsed };
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

