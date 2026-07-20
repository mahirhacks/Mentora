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
    "Clear AI-created content from the teaching board while preserving student-created work. Set includeUserObjects only when the student explicitly asks to clear their own work too.",
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
          "Also clear student-created work. Use only after an explicit student request.",
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
  execute(input, state) {
    const userObjects = Object.fromEntries(
      Object.entries(state.objects).filter(
        ([, object]) => object.createdBy === "user",
      ),
    );
    const preservedUserCount = input.includeUserObjects
      ? 0
      : Object.keys(userObjects).length;
    const nextObjects = input.includeUserObjects ? {} : userObjects;
    const removedCount =
      Object.keys(state.objects).length - Object.keys(nextObjects).length;
    const fresh = createBoardState();
    state.objects = nextObjects;
    state.activity = input.includeUserObjects
      ? fresh.activity
      : state.activity;
    state.revision = state.revision + 1;

    return {
      cleared: true,
      removedCount,
      preservedUserCount,
    };
  },
};
