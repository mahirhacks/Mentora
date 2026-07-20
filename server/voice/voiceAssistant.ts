import WebSocket from "ws";
import OpenAI from "openai";
import {
  buildGaSessionUpdate,
  createRealtimeClientSecret,
  type RealtimeVoice,
} from "./realtimeGa.js";
import type {
  VoiceInterpreterInput,
  VoiceInterpretationResult,
  VoiceSessionConfig,
} from "./types.js";
import { buildVoicePerformerPrompt } from "./types.js";

export const VOICE_PERFORMER_INSTRUCTIONS = `
You are Mentora's voice performer, not its teaching brain.

You receive a JSON payload with:
- user_prompt: the student's message for this turn
- observation: verified board state after tool steps

You also receive a prepared voice script from the lesson director.
Speak that script naturally as teacher audio.

Rules:
- Follow the prepared script closely. Do not invent new teaching content.
- Use user_prompt only for conversational context and tone.
- Only refer to board objects that appear in observation.
- Do not call tools or decide the next lesson step.
`.trim();

export interface VoiceAssistantOptions {
  model?: string;
  apiKey?: string;
  voice?: RealtimeVoice;
}

/**
 * Contextual voice interpreter backed by gpt-realtime GA API.
 * Converts prepared voice scripts into natural audio + transcript.
 */
export class VoiceAssistant {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly voice: RealtimeVoice;
  private activeAbort: AbortController | null = null;

  constructor(
    private readonly client: OpenAI,
    options: VoiceAssistantOptions = {},
  ) {
    this.model = options.model ?? "gpt-realtime-2.1-mini";
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.voice = options.voice ?? "alloy";
  }

  getSessionConfig(): VoiceSessionConfig {
    return {
      model: this.model,
      instructions: VOICE_PERFORMER_INSTRUCTIONS,
      outputModalities: ["audio"],
      toolChoice: "none",
    };
  }

  buildClientInterpreterPayload(input: VoiceInterpreterInput) {
    return {
      instructions: VOICE_PERFORMER_INSTRUCTIONS,
      input: buildVoicePerformerPrompt(input),
    };
  }

  async createClientSession() {
    const secret = await createRealtimeClientSecret({
      apiKey: this.apiKey,
      model: this.model,
      instructions: VOICE_PERFORMER_INSTRUCTIONS,
      voice: this.voice,
    });

    return {
      ...secret,
      configuredModel: this.model,
      client_secret: {
        value: secret.value,
        expires_at: secret.expires_at,
      },
    };
  }

  cancel() {
    this.activeAbort?.abort();
    this.activeAbort = null;
  }

  async interpretSpeech(
    input: VoiceInterpreterInput,
    options?: { script?: string; signal?: AbortSignal },
  ): Promise<VoiceInterpretationResult> {
    const abort = new AbortController();
    this.activeAbort = abort;

    const onExternalAbort = () => abort.abort();
    options?.signal?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      return await this.interpretWithRealtime(input, options?.script ?? "", abort.signal);
    } catch (error) {
      if (abort.signal.aborted) {
        throw new Error("Voice output cancelled.");
      }

      console.warn(
        "Realtime voice interpreter unavailable, using text fallback:",
        error instanceof Error ? error.message : error,
      );
      return this.interpretWithTextFallback(input, options?.script ?? "", abort.signal);
    } finally {
      options?.signal?.removeEventListener("abort", onExternalAbort);
      if (this.activeAbort === abort) {
        this.activeAbort = null;
      }
    }
  }

  private buildPerformerMessage(input: VoiceInterpreterInput, script: string): string {
    return [
      "Prepared voice script:",
      script,
      "",
      "Context JSON:",
      buildVoicePerformerPrompt(input),
    ].join("\n");
  }

  private extractAudioDelta(payload: Record<string, unknown>): string {
    if (typeof payload.delta === "string") {
      return payload.delta;
    }
    if (typeof payload.audio === "string") {
      return payload.audio;
    }
    return "";
  }

  private extractTranscriptDelta(payload: Record<string, unknown>): string {
    if (typeof payload.delta === "string") {
      return payload.delta;
    }
    if (typeof payload.transcript === "string") {
      return payload.transcript;
    }
    return "";
  }

  private extractRealtimeError(payload: Record<string, unknown>): string {
    if (payload.error && typeof payload.error === "object") {
      return JSON.stringify(payload.error);
    }
    return "Realtime interpreter error";
  }

  private async interpretWithRealtime(
    input: VoiceInterpreterInput,
    script: string,
    signal: AbortSignal,
  ): Promise<VoiceInterpretationResult> {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.model)}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      const audioChunks: Buffer[] = [];
      let naturalText = "";
      let settled = false;
      let promptSent = false;

      const cleanup = (timeout: NodeJS.Timeout) => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
      };

      const finish = (result: VoiceInterpretationResult, timeout: NodeJS.Timeout) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup(timeout);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        resolve(result);
      };

      const fail = (error: Error, timeout: NodeJS.Timeout) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup(timeout);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        reject(error);
      };

      const timeout = setTimeout(() => {
        fail(new Error("Realtime voice interpreter timed out."), timeout);
      }, 45_000);

      const onAbort = () => {
        fail(new Error("Voice output cancelled."), timeout);
      };

      signal.addEventListener("abort", onAbort);

      const sendPrompt = () => {
        if (promptSent) {
          return;
        }
        promptSent = true;

        ws.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: this.buildPerformerMessage(input, script),
                },
              ],
            },
          }),
        );

        ws.send(
          JSON.stringify({
            type: "response.create",
            response: {
              output_modalities: ["audio"],
            },
          }),
        );
      };

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: buildGaSessionUpdate({
              model: this.model,
              instructions: VOICE_PERFORMER_INSTRUCTIONS,
              voice: this.voice,
            }),
          }),
        );
      });

      ws.on("message", (raw) => {
        const payload = JSON.parse(raw.toString()) as Record<string, unknown>;
        const type = String(payload.type ?? "");

        if (type === "session.created" || type === "session.updated") {
          sendPrompt();
        }

        if (
          type === "response.output_audio.delta" ||
          type === "response.audio.delta"
        ) {
          const delta = this.extractAudioDelta(payload);
          if (delta) {
            audioChunks.push(Buffer.from(delta, "base64"));
          }
        }

        if (
          type === "response.output_audio_transcript.delta" ||
          type === "response.audio_transcript.delta" ||
          type === "response.output_text.delta"
        ) {
          naturalText += this.extractTranscriptDelta(payload);
        }

        if (
          type === "response.output_audio_transcript.done" ||
          type === "response.audio_transcript.done" ||
          type === "response.output_text.done"
        ) {
          const transcript = this.extractTranscriptDelta(payload);
          if (transcript) {
            naturalText = transcript;
          }
        }

        if (type === "response.done" || type === "response.completed") {
          const audioBuffer = Buffer.concat(audioChunks);
          if (audioBuffer.length === 0) {
            fail(new Error("Realtime interpreter returned no audio."), timeout);
            return;
          }

          finish(
            {
              naturalText: naturalText || script,
              audioBase64: audioBuffer.toString("base64"),
              mimeType: "audio/pcm16",
            },
            timeout,
          );
        }

        if (type === "error") {
          fail(new Error(this.extractRealtimeError(payload)), timeout);
        }
      });

      ws.on("error", (error) => {
        fail(
          error instanceof Error ? error : new Error("Realtime websocket failed."),
          timeout,
        );
      });

      ws.on("close", (code, reason) => {
        if (settled) {
          return;
        }

        const reasonText = reason.toString();
        fail(
          new Error(
            reasonText
              ? `Realtime websocket closed (${code}): ${reasonText}`
              : `Realtime websocket closed (${code})`,
          ),
          timeout,
        );
      });
    });
  }

  private async interpretWithTextFallback(
    input: VoiceInterpreterInput,
    script: string,
    signal: AbortSignal,
  ): Promise<VoiceInterpretationResult> {
    const completion = await this.client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: VOICE_PERFORMER_INSTRUCTIONS,
          },
          {
            role: "user",
            content: this.buildPerformerMessage(input, script),
          },
        ],
        temperature: 0.4,
      },
      { signal },
    );

    const naturalText = completion.choices[0]?.message?.content?.trim() || script;

    return { naturalText };
  }
}
