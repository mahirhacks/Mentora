import { boardTools } from "../../tools/index.js";
import type OpenAI from "openai";

const boardToolNames = boardTools.map((tool) => tool.name);

const speakDirectiveSchema = {
  type: "object",
  additionalProperties: false,
  required: ["speech_id", "voice_script", "board_references", "question"],
  properties: {
    speech_id: { type: "string" },
    voice_script: {
      type: "string",
      description:
        "Natural spoken teaching line for the voice performer. Write exactly how Mentora should sound aloud, responding to the student's message.",
    },
    board_references: {
      type: "array",
      items: { type: "string" },
    },
    question: {
      type: ["string", "null"],
      description:
        "Final student question for the last speak step only. Otherwise null.",
    },
  },
} as const;

export function toOpenAiTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return [
    {
      type: "function",
      function: {
        name: "submit_teaching_script",
        description:
          "Submit the full ordered lesson script for this teaching turn.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["steps"],
          properties: {
            steps: {
              type: "array",
              minItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["step_type"],
                properties: {
                  step_type: {
                    type: "string",
                    enum: ["speak", "tool", "observe"],
                  },
                  text: {
                    type: "string",
                    description: "Required for observe steps.",
                  },
                  speech: speakDirectiveSchema,
                  tool_name: { type: "string", enum: boardToolNames },
                  tool_input: { type: "object" },
                  board_references: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Optional observe-step object ids to verify on the board.",
                  },
                },
              },
            },
          },
        },
      },
    },
  ];
}

export const boardToolSchemasForPrompt = boardTools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
}));
