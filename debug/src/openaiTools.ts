import { boardTools } from "../../server/tools/index.js";
import type OpenAI from "openai";

const boardToolNames = boardTools.map((tool) => tool.name);

export function toOpenAiTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return [
    {
      type: "function",
      function: {
        name: "submit_teaching_script",
        description:
          "Submit the full ordered lesson script. Always use this once per student request. Mix speak, tool, and observe steps in a natural teaching flow.",
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
                    description:
                      "Required for speak and observe. What the teacher says out loud.",
                  },
                  tool_name: {
                    type: "string",
                    enum: boardToolNames,
                    description: "Required for tool steps.",
                  },
                  tool_input: {
                    type: "object",
                    description: "Required for tool steps.",
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
