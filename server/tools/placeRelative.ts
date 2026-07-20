import {
  getBounds,
  getObject,
  placeRelativeBounds,
} from "./boardState.js";
import type { BoardState, RelativeRelation, ToolDefinition } from "./types.js";

export interface PlaceRelativeInput {
  objectId: string;
  referenceId: string;
  relation: RelativeRelation;
  offset?: number;
}

export interface PlaceRelativeResult {
  objectId: string;
  referenceId: string;
  relation: RelativeRelation;
  bounds: { x: number; y: number; width: number; height: number };
}

export const placeRelativeTool: ToolDefinition<
  PlaceRelativeInput,
  PlaceRelativeResult
> = {
  name: "place_relative",
  description:
    "Move an existing board object relative to another object (above, below, left, right, inside, or center).",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["objectId", "referenceId", "relation"],
    properties: {
      objectId: { type: "string" },
      referenceId: { type: "string" },
      relation: {
        type: "string",
        enum: ["above", "below", "left", "right", "inside", "center"],
      },
      offset: { type: "number", default: 12 },
    },
  },
  resultSchema: {
    type: "object",
    required: ["objectId", "referenceId", "relation", "bounds"],
    properties: {
      objectId: { type: "string" },
      referenceId: { type: "string" },
      relation: {
        type: "string",
        enum: ["above", "below", "left", "right", "inside", "center"],
      },
      bounds: {
        type: "object",
        required: ["x", "y", "width", "height"],
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
        },
      },
    },
  },
  execute(input, state) {
    const subject = getObject(state, input.objectId);
    const reference = getObject(state, input.referenceId);
    const subjectBounds = getBounds(subject);
    const referenceBounds = getBounds(reference);
    const bounds = placeRelativeBounds(
      referenceBounds,
      subjectBounds,
      input.relation,
      input.offset ?? 12,
    );

    const updated = {
      ...subject,
      bounds,
    };

    state.objects = {
      ...state.objects,
      [subject.id]: updated,
    };
    state.revision += 1;

    return {
      objectId: subject.id,
      referenceId: input.referenceId,
      relation: input.relation,
      bounds,
    };
  },
};
