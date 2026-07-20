import {
  DEFAULT_REALTIME_MODEL,
  DEFAULT_PLANNER_MODEL,
} from "@mentora/shared";
import { env } from "../env.js";

export function realtimeSessionConfig() {
  return {
    type: "realtime" as const,
    model: env.realtimeModel || DEFAULT_REALTIME_MODEL,
    reasoning: { effort: "low" as const },
    output_modalities: ["audio" as const],
    // Client owns decide-then-voice; mint session must not advertise tool-driven teaching.
    tools: [] as const,
    tool_choice: "none" as const,
    instructions: `You are Mentora, a patient real-time AI teacher. You speak only. The client Decision API evaluates answers and draws the board. Never call tools. Never call update_lesson_state. After you finish a check question, stop and wait.`,
    audio: {
      input: {
        turn_detection: {
          type: "semantic_vad" as const,
          eagerness: "medium" as const,
          create_response: false,
          interrupt_response: true,
        },
      },
      output: { voice: "marin" as const },
    },
  };
}

export { DEFAULT_PLANNER_MODEL };
