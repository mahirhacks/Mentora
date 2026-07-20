import { createBoardState } from "./boardState.js";
import type { BoardState, ToolDefinition } from "./types.js";

export interface ResetBoardInput {
  confirm?: boolean;
}

export interface ResetBoardResult {
  cleared: boolean;
  removedCount: number;
}

export const resetBoardTool: ToolDefinition<ResetBoardInput, ResetBoardResult> = {
  name: "reset_board",
  description:
    "Clear the entire teaching board and remove all shapes, text, labels, highlights, and pointers. Use when starting a completely fresh diagram or when the board is too cluttered to continue teaching.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      confirm: {
        type: "boolean",
        description: "Optional acknowledgement flag. Defaults to true.",
      },
    },
  },
  resultSchema: {
    type: "object",
    required: ["cleared", "removedCount"],
    properties: {
      cleared: { type: "boolean" },
      removedCount: { type: "integer" },
    },
  },
  execute(_input, state) {
    const removedCount = Object.keys(state.objects).length;
    const fresh = createBoardState();
    state.objects = fresh.objects;
    state.revision = state.revision + 1;

    return {
      cleared: true,
      removedCount,
    };
  },
};
