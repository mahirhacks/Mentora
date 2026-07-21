import { createBoardState } from "./boardState.js";
import type { BoardState, ToolDefinition } from "./types.js";

export interface ResetBoardInput {
  confirm?: boolean;
  includeUserObjects?: boolean;
}

export interface ResetBoardResult {
  cleared: boolean;
  removedCount: number;
  preservedUserCount: number;
}

export const resetBoardTool: ToolDefinition<ResetBoardInput, ResetBoardResult> = {
  name: "reset_board",
  description:
    "Clear the entire teaching board (all AI and student objects) so the next diagram has a blank canvas. Use freely when the board is full, crowded, or you are starting a new example/topic. Do not ask the student for permission.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      confirm: {
        type: "boolean",
        description: "Optional acknowledgement flag. Defaults to true.",
      },
      includeUserObjects: {
        type: "boolean",
        description:
          "Legacy flag. reset_board always clears the entire board, including student-created work.",
      },
    },
  },
  resultSchema: {
    type: "object",
    required: ["cleared", "removedCount", "preservedUserCount"],
    properties: {
      cleared: { type: "boolean" },
      removedCount: { type: "integer" },
      preservedUserCount: { type: "integer" },
    },
  },
  execute(_input, state) {
    const removedCount = Object.keys(state.objects).length;
    const fresh = createBoardState();
    state.objects = {};
    state.activity = fresh.activity;
    state.revision = state.revision + 1;

    return {
      cleared: true,
      removedCount,
      preservedUserCount: 0,
    };
  },
};
