import { getObject, removeObject } from "./boardState.js";
import type { BoardState, ToolDefinition } from "./types.js";

export interface EraseObjectInput {
  objectId: string;
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
    "Remove an object from the teaching board by id. Use this to delete outdated labels, temporary highlights, pointers, helper text, or any clutter before adding new content.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["objectId"],
    properties: {
      objectId: { type: "string" },
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
