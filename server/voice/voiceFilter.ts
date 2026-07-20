import type { AudioCaptureConstraints, VoiceFilterConfig } from "./types.js";

export const DEFAULT_VOICE_FILTER_CONFIG: VoiceFilterConfig = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  highpassFilter: true,
};

/**
 * Describes capture-side filtering for student microphone input.
 * The browser applies echo/noise cancellation via getUserMedia constraints;
 * the server validates incoming audio before transcription.
 */
export class VoiceFilter {
  constructor(private readonly config: VoiceFilterConfig = DEFAULT_VOICE_FILTER_CONFIG) {}

  getConfig(): VoiceFilterConfig {
    return { ...this.config };
  }

  getCaptureConstraints(): AudioCaptureConstraints {
    return {
      echoCancellation: this.config.echoCancellation,
      noiseSuppression: this.config.noiseSuppression,
      autoGainControl: this.config.autoGainControl,
      sampleRate: 24_000,
      channelCount: 1,
    };
  }

  /**
   * Constraint object for browser MediaDevices.getUserMedia().
   */
  getBrowserAudioConstraints(): Record<string, unknown> {
    return {
      audio: {
        echoCancellation: this.config.echoCancellation,
        noiseSuppression: this.config.noiseSuppression,
        autoGainControl: this.config.autoGainControl,
        channelCount: 1,
        sampleRate: 24_000,
      },
      video: false,
    };
  }

  /**
   * Lightweight server-side validation before sending audio to the transcriber.
   */
  validateAudioBuffer(
    audio: Buffer,
    options?: { minBytes?: number; maxBytes?: number },
  ): { ok: true } | { ok: false; reason: string } {
    const minBytes = options?.minBytes ?? 256;
    const maxBytes = options?.maxBytes ?? 25 * 1024 * 1024;

    if (!audio || audio.length === 0) {
      return { ok: false, reason: "Audio buffer is empty." };
    }

    if (audio.length < minBytes) {
      return { ok: false, reason: "Audio clip is too short to transcribe." };
    }

    if (audio.length > maxBytes) {
      return { ok: false, reason: "Audio clip exceeds the maximum upload size." };
    }

    return { ok: true };
  }
}
