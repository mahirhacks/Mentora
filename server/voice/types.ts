import type { BoardState } from "../tools/types.js";

export type StudentTurnSource = "voice" | "chat";

export interface StudentTurn {
  source: StudentTurnSource;
  text: string;
}

export interface SpeakDirective {
  speechId: string;
  voiceScript: string;
  boardObjectIds: string[];
  finalQuestion: string | null;
}

export interface VerifiedBoardObservation {
  objects: Record<
    string,
    {
      id: string;
      kind: string;
      summary: string;
      region: string;
      createdBy: "ai" | "user";
      updatedBy: "ai" | "user";
    }
  >;
  relationships: string[];
  layoutSummary: string;
}

export interface VoiceInterpreterInput {
  userPrompt: string;
  observation: string;
}

export interface VoiceInterpretationResult {
  naturalText: string;
  transcriptFromVoiceModel: boolean;
  audioBase64?: string;
  mimeType?: string;
}

export interface VoicePerformer {
  interpretSpeech(
    input: VoiceInterpreterInput,
    options?: { script?: string; signal?: AbortSignal },
  ): Promise<VoiceInterpretationResult>;
}

export interface VoiceFilterConfig {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  highpassFilter: boolean;
}

export interface AudioCaptureConstraints {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sampleRate: number;
  channelCount: number;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  durationMs?: number;
}

export interface VoiceSessionConfig {
  model: string;
  instructions: string;
  outputModalities: Array<"audio" | "text">;
  toolChoice: "none";
}

export interface HandleStudentTurnOptions {
  source: StudentTurnSource;
  text: string;
  enableVoice?: boolean;
}

export interface VoicePlaybackEvent {
  type: "speech_interpreted";
  index: number;
  speechId: string;
  naturalText: string;
  directive: SpeakDirective;
}

export interface VoiceAudioEvent {
  type: "voice_audio";
  index: number;
  speechId: string;
  audioBase64: string;
  mimeType: string;
}

export function speakDirectiveFromLegacyText(text: string): SpeakDirective {
  const trimmed = text.trim();
  const questionMatch = trimmed.match(/^(.*\?)\s*$/);
  const finalQuestion = questionMatch ? trimmed : null;

  return {
    speechId: `legacy_${Date.now()}`,
    voiceScript: trimmed,
    boardObjectIds: [],
    finalQuestion,
  };
}

export function isSpeakDirective(value: unknown): value is SpeakDirective {
  if (!value || typeof value !== "object") {
    return false;
  }

  const directive = value as Partial<SpeakDirective>;
  return (
    typeof directive.speechId === "string" &&
    directive.speechId.length > 0 &&
    typeof directive.voiceScript === "string" &&
    directive.voiceScript.trim().length > 0 &&
    Array.isArray(directive.boardObjectIds) &&
    directive.boardObjectIds.every(
      (objectId) => typeof objectId === "string" && objectId.length > 0,
    ) &&
    (directive.finalQuestion === null ||
      typeof directive.finalQuestion === "string")
  );
}

export function summarizeObservationForPrompt(
  observation: VerifiedBoardObservation,
): string {
  const objectLines = Object.values(observation.objects).map(
    (entry) => `- ${entry.id}: ${entry.summary} (${entry.region})`,
  );

  return [
    observation.layoutSummary,
    ...objectLines,
    ...observation.relationships.map((line) => `- ${line}`),
  ].join("\n");
}

export function buildVoicePerformerPrompt(
  input: VoiceInterpreterInput,
): string {
  return JSON.stringify(
    {
      user_prompt: input.userPrompt,
      observation: input.observation,
    },
    null,
    2,
  );
}

export type { BoardState };
