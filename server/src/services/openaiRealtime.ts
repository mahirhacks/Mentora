import {
  DEFAULT_REALTIME_MODEL,
  DEFAULT_PLANNER_MODEL,
  REALTIME_TOOLS,
} from "@mentora/shared";
import { env } from "../env.js";

export function realtimeSessionConfig() {
  return {
    type: "realtime" as const,
    model: env.realtimeModel || DEFAULT_REALTIME_MODEL,
    reasoning: { effort: "low" as const },
    output_modalities: ["audio" as const],
    tools: REALTIME_TOOLS,
    tool_choice: "auto" as const,
    instructions: `You are Mentora, a visual AI math teacher. Always use board_apply_actions to draw on the whiteboard while teaching. Speak at most 1-2 short sentences before each board tool call.`,
    audio: {
      input: {
        turn_detection: {
          type: "semantic_vad" as const,
          eagerness: "low" as const,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: "marin" as const },
    },
  };
}

export { DEFAULT_PLANNER_MODEL };
