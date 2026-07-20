import { commitObject, nextObjectId } from "./boardState.js";
import { fitBoundsInCanvas } from "./boundsGuard.js";
import { clearOverlappingBeforePlace } from "./placementGuard.js";
import type { BoardState, ToolDefinition } from "./types.js";
export interface WriteTextInput {
  id?: string;
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  align?: "left" | "center" | "right";
  maxWidth?: number;
  style?: {
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    opacity?: number;
  };
}

export interface WriteTextResult {
  textId: string;
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
  autoErased?: string[];
  clamped?: boolean;
}

function estimateTextBounds(
  text: string,
  fontSize: number,
  maxWidth?: number,
) {
  const charWidth = fontSize * 0.72;
  const lineHeight = Math.round(fontSize * 1.35);
  const lines = text.split("\n");

  if (!maxWidth) {
    const widestLine = lines.reduce(
      (max, line) => Math.max(max, line.length),
      0,
    );
    return {
      width: Math.max(Math.round(widestLine * charWidth) + 16, 24),
      height: Math.max(lines.length * lineHeight, lineHeight),
    };
  }

  let totalLines = 0;
  for (const line of lines) {
    const charsPerLine = Math.max(Math.floor(maxWidth / charWidth), 1);
    totalLines += Math.max(Math.ceil(line.length / charsPerLine), 1);
  }

  return {
    width: maxWidth,
    height: Math.max(totalLines * lineHeight, lineHeight),
  };
}

function alignX(
  x: number,
  width: number,
  align: "left" | "center" | "right",
) {
  switch (align) {
    case "center":
      return x - width / 2;
    case "right":
      return x - width;
    default:
      return x;
  }
}

export const writeTextTool: ToolDefinition<WriteTextInput, WriteTextResult> = {
  name: "write_text",
  description:
    "Write standalone text on the canvas at a specific position (1280x720). Use for titles, code lines, equations, or explanations. Left column: x~80, align=left. Center titles: x=640, align=center. Right column: x~1180, align=right. Set maxWidth<=280 for side notes.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["text", "x", "y"],
    properties: {
      id: { type: "string", description: "Optional stable object id." },
      text: { type: "string" },
      x: { type: "number", description: "Anchor x position in canvas pixels." },
      y: { type: "number", description: "Anchor y position in canvas pixels." },
      fontSize: { type: "number", default: 18 },
      fontWeight: {
        type: "string",
        enum: ["normal", "bold"],
        default: "normal",
      },
      align: {
        type: "string",
        enum: ["left", "center", "right"],
        default: "left",
        description: "How x anchors the text box.",
      },
      maxWidth: {
        type: "number",
        description: "Optional wrap width for multi-line text estimation.",
      },
      style: {
        type: "object",
        properties: {
          stroke: { type: "string" },
          fill: { type: "string", description: "Text color." },
          strokeWidth: { type: "number" },
          opacity: { type: "number" },
        },
      },
    },
  },
  resultSchema: {
    type: "object",
    required: ["textId", "text", "bounds"],
    properties: {
      textId: { type: "string" },
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
    const fontSize = input.fontSize ?? 18;
    const align = input.align ?? "left";
    const size = estimateTextBounds(input.text, fontSize, input.maxWidth);
    const rawBounds = {
      x: alignX(input.x, size.width, align),
      y: input.y,
      width: size.width,
      height: size.height,
    };
    const bounds = fitBoundsInCanvas(rawBounds);
    const clamped =
      bounds.x !== rawBounds.x ||
      bounds.y !== rawBounds.y ||
      bounds.width !== rawBounds.width ||
      bounds.height !== rawBounds.height;

    const textId = input.id ?? nextObjectId("text");
    const autoErased = clearOverlappingBeforePlace(state, bounds, {
      exceptIds: [textId],
    });

    const nextState = commitObject(state, {
      id: textId,
      kind: "text",
      text: input.text,
      bounds,
      fontSize,
      fontWeight: input.fontWeight ?? "normal",
      align,
      maxWidth: input.maxWidth,
      style: {
        fill: "#0f172a",
        ...input.style,
      },
    });

    state.objects = nextState.objects;
    state.revision = nextState.revision;

    return {
      textId,
      text: input.text,
      bounds,
      autoErased,
      clamped,
    };
  },
};
