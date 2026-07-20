import { getObject, removeObject } from "./boardState.js";
import type { BoardState, ToolDefinition } from "./types.js";

export interface EraseObjectInput {
  objectId: string;
  allowUserObject?: boolean;
}

export interface EraseObjectResult {
  erased: boolean;
  objectId: string;
  removedKind?: string;
}

export const eraseObjectTool: ToolDefinition<
  EraseObjectInput,
  EraseObjectResult
> = {
  name: "erase_object",
  description:
    "Remove an AI-created object from the teaching board by id. User-created objects are protected unless allowUserObject is true, which is only appropriate when the student explicitly asks to replace or remove their work.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["objectId"],
    properties: {
      objectId: { type: "string", minLength: 1, maxLength: 80 },
      allowUserObject: {
        type: "boolean",
        description:
          "Permit deleting student-created work. Use only after an explicit student request.",
      },
    },
  },
  resultSchema: {
    type: "object",
    required: ["erased", "objectId"],
    properties: {
      erased: { type: "boolean" },
      objectId: { type: "string" },
      removedKind: { type: "string" },
    },
  },
  execute(input, state) {
    const existing = getObject(state, input.objectId);
    if (existing.createdBy === "user" && input.allowUserObject !== true) {
      throw new Error(
        `Object ${input.objectId} was created by the student and is protected.`,
      );
    }
    const nextState = removeObject(state, input.objectId);

    state.objects = nextState.objects;
    state.revision = nextState.revision;

    return {
      erased: true,
      objectId: input.objectId,
      removedKind: existing.kind,
    };
  },
};
