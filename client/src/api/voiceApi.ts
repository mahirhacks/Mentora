import type { LessonEvent } from "../types";
import { consumeLessonStream } from "./sse";

export interface VoiceConfig {
  capture: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    sampleRate: number;
    channelCount: number;
  };
  browserAudio: Record<string, unknown>;
}

export async function fetchVoiceConfig(): Promise<VoiceConfig> {
  const response = await fetch("/api/voice/config");
  if (!response.ok) {
    throw new Error("Failed to load voice configuration");
  }
  return response.json() as Promise<VoiceConfig>;
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const response = await fetch("/api/voice/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": blob.type || "audio/webm",
    },
    body: blob,
  });

  const payload = (await response.json()) as { text?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Transcription failed");
  }

  const text = payload.text?.trim();
  if (!text) {
    throw new Error("No speech detected.");
  }

  return text;
}

export async function streamStudentTurn(
  text: string,
  source: "voice" | "chat",
  sessionId: string | null,
  onEvent: (event: LessonEvent) => void | Promise<void>,
  options?: {
    enableVoice?: boolean;
    turnId?: string;
    signal?: AbortSignal;
    onSession?: (sessionId: string) => void;
  },
): Promise<string | null> {
  const response = await fetch("/api/student-turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      source,
      sessionId,
      turnId: options?.turnId,
      enableVoice: options?.enableVoice ?? true,
    }),
    signal: options?.signal,
  });

  return consumeLessonStream(response, sessionId, onEvent, {
    signal: options?.signal,
    turnId: options?.turnId,
    onSession: options?.onSession,
  });
}
