export type RealtimeVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "sage"
  | "shimmer"
  | "verse";

const PCM_OUTPUT_FORMAT = {
  type: "audio/pcm" as const,
  rate: 24_000,
};

export function buildGaSessionUpdate(options: {
  instructions: string;
  voice: RealtimeVoice;
  model?: string;
}) {
  return {
    type: "realtime" as const,
    ...(options.model ? { model: options.model } : {}),
    instructions: options.instructions,
    tool_choice: "none" as const,
    tools: [] as [],
    output_modalities: ["audio"] as const,
    max_output_tokens: "inf" as const,
    audio: {
      input: {
        turn_detection: null,
      },
      output: {
        voice: options.voice,
        format: PCM_OUTPUT_FORMAT,
      },
    },
  };
}

export interface RealtimeClientSecretResponse {
  value: string;
  expires_at: number;
  session?: Record<string, unknown>;
}

export async function createRealtimeClientSecret(input: {
  apiKey: string;
  model: string;
  instructions: string;
  voice: RealtimeVoice;
}): Promise<RealtimeClientSecretResponse> {
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: buildGaSessionUpdate({
        model: input.model,
        instructions: input.instructions,
        voice: input.voice,
      }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to create realtime client secret");
  }

  return response.json() as Promise<RealtimeClientSecretResponse>;
}
