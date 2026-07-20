import {
  boundsCenter,
  commitObject,
  getBounds,
  getObject,
  nextObjectId,
  placeRelativeBounds,
} from "./boardState.js";
import { clearOverlappingBeforePlace } from "./placementGuard.js";
import { fitBoundsInCanvas } from "./boundsGuard.js";
import type { BoardState, ToolDefinition } from "./types.js";

export interface LabelInInput {
  targetId: string;
  text: string;
  position?: "center" | "top" | "bottom" | "left" | "right";
  style?: {
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    opacity?: number;
  };
}

export interface LabelInResult {
  labelId: string;
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
  autoErased?: string[];
}

function estimateLabelBounds(text: string) {
  const width = Math.max(text.length * 8, 24);
  const height = 20;
  return { width, height };
}

export const labelInTool: ToolDefinition<LabelInInput, LabelInResult> = {
  name: "label_in",
  description:
    "Place a text label inside or around an existing board object such as a shape or divided region.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["targetId", "text"],
    properties: {
      targetId: { type: "string", minLength: 1, maxLength: 80 },
      text: { type: "string", minLength: 1, maxLength: 240 },
      position: {
        type: "string",
        enum: ["center", "top", "bottom", "left", "right"],
        default: "center",
      },
      style: {
        type: "object",
        additionalProperties: false,
        properties: {
          stroke: { type: "string" },
          fill: { type: "string" },
          strokeWidth: { type: "number", minimum: 0, maximum: 20 },
          opacity: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
  resultSchema: {
    type: "object",
    required: ["labelId", "text", "bounds"],
    properties: {
      labelId: { type: "string" },
      text: { type: "string" },
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
    const target = getObject(state, input.targetId);
    const position = input.position ?? "center";
    const labelSize = estimateLabelBounds(input.text);
    const targetBounds = getBounds(target);

    const relation =
      position === "top"
        ? "above"
        : position === "bottom"
          ? "below"
          : position === "left"
            ? "left"
            : position === "right"
              ? "right"
              : "center";

    const bounds =
      relation === "center"
        ? {
            x: boundsCenter(targetBounds).x - labelSize.width / 2,
            y: boundsCenter(targetBounds).y - labelSize.height / 2,
            width: labelSize.width,
            height: labelSize.height,
          }
        : placeRelativeBounds(
            targetBounds,
            {
              x: 0,
              y: 0,
              width: labelSize.width,
              height: labelSize.height,
            },
            relation,
            4,
          );
    const fittedBounds = fitBoundsInCanvas(bounds);

    const labelId = nextObjectId("label");
    const autoErased = clearOverlappingBeforePlace(state, fittedBounds, {
      exceptIds: [labelId, input.targetId],
    });

    const nextState = commitObject(state, {
      id: labelId,
      kind: "label",
      text: input.text,
      anchorId: input.targetId,
      position,
      bounds: fittedBounds,
      style: input.style,
    });

    state.objects = nextState.objects;
    state.revision = nextState.revision;

    return {
      labelId,
      text: input.text,
      bounds: fittedBounds,
      autoErased,
    };
  },
};
