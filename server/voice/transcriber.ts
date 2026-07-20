import { Readable } from "node:stream";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import type { TranscriptionResult } from "./types.js";
import { VoiceFilter } from "./voiceFilter.js";

export interface TranscriberOptions {
  model?: string;
  language?: string;
  voiceFilter?: VoiceFilter;
}

/**
 * Converts recorded student audio into canonical text before it enters
 * handleStudentTurn({ source: "voice", text }).
 */
export class Transcriber {
  private readonly model: string;
  private readonly language?: string;
  private readonly voiceFilter: VoiceFilter;

  constructor(
    private readonly client: OpenAI,
    options: TranscriberOptions = {},
  ) {
    this.model = options.model ?? "gpt-4o-mini-transcribe";
    this.language = options.language;
    this.voiceFilter = options.voiceFilter ?? new VoiceFilter();
  }

  async transcribe(
    audio: Buffer,
    filename = "student.webm",
    mimeType = "audio/webm",
  ): Promise<TranscriptionResult> {
    const validation = this.voiceFilter.validateAudioBuffer(audio);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    const startedAt = Date.now();
    const file = await toFile(Readable.from(audio), filename, { type: mimeType });

    const response = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
      language: this.language,
      response_format: "json",
    });

    const text = response.text?.trim() ?? "";
    if (!text) {
      throw new Error("Transcription returned empty text.");
    }

    return {
      text,
      language: this.language,
      durationMs: Date.now() - startedAt,
    };
  }
}
