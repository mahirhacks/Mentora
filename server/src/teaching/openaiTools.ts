import { boardTools } from "../../tools/index.js";
import type OpenAI from "openai";

const boardToolNames = boardTools.map((tool) => tool.name);

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
                  text: { type: "string" },
                  tool_name: { type: "string", enum: boardToolNames },
                  tool_input: { type: "object" },
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
