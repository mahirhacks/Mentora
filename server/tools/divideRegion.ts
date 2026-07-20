import {
  commitObject,
  getBounds,
  getObject,
  nextObjectId,
  splitBounds,
} from "./boardState.js";
import type { ToolDefinition } from "./types.js";

export interface DivideRegionInput {
  targetId: string;
  divisions: number;
  direction?: "horizontal" | "vertical";
  style?: {
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    opacity?: number;
  };
}

export interface DivideRegionResult {
  parentId: string;
  regionIds: string[];
  direction: "horizontal" | "vertical";
}

export const divideRegionTool: ToolDefinition<
  DivideRegionInput,
  DivideRegionResult
> = {
  name: "divide_region",
  description:
    "Divide an existing board region or shape into equal horizontal or vertical slices.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["targetId", "divisions"],
    properties: {
      targetId: { type: "string" },
      divisions: { type: "integer", minimum: 1, maximum: 12 },
      direction: {
        type: "string",
        enum: ["horizontal", "vertical"],
        default: "vertical",
      },
      style: {
        type: "object",
        properties: {
          stroke: { type: "string" },
          fill: { type: "string" },
          strokeWidth: { type: "number" },
          opacity: { type: "number" },
        },
      },
    },
  },
  resultSchema: {
    type: "object",
    required: ["parentId", "regionIds", "direction"],
    properties: {
      parentId: { type: "string" },
      regionIds: {
        type: "array",
        items: { type: "string" },
      },
      direction: {
        type: "string",
        enum: ["horizontal", "vertical"],
      },
    },
  },
  execute(input, state) {
    const target = getObject(state, input.targetId);
    const direction = input.direction ?? "vertical";
    const slices = splitBounds(getBounds(target), input.divisions, direction);
    const regionIds: string[] = [];

    let nextState = state;
    for (let index = 0; index < slices.length; index += 1) {
      const regionId = nextObjectId("region");
      regionIds.push(regionId);
      nextState = commitObject(nextState, {
        id: regionId,
        kind: "division",
        parentId: input.targetId,
        regionIndex: index,
        bounds: slices[index],
        style: input.style,
      });
    }

    state.objects = nextState.objects;
    state.revision = nextState.revision;

    return {
      parentId: input.targetId,
      regionIds,
      direction,
    };
  },
};
