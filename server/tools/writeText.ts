import { commitObject, nextObjectId, removeObject } from "./boardState.js";
import { fitBoundsInCanvas } from "./boundsGuard.js";
import { clearOverlappingBeforePlace } from "./placementGuard.js";
import {
  layoutTextWords,
  offsetLaidOutWords,
} from "./textLayout.js";
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
  wordIds: string[];
  autoErased?: string[];
  clamped?: boolean;
}

function removeExistingTextGroup(state: BoardState, groupId: string) {
  const removable = Object.values(state.objects).filter(
    (object) =>
      object.kind === "text" &&
      (object.id === groupId ||
        object.groupId === groupId ||
        object.id.startsWith(`${groupId}_w`)),
  );
  for (const object of removable) {
    const next = removeObject(state, object.id);
    state.objects = next.objects;
    state.revision = next.revision;
  }
}

export const writeTextTool: ToolDefinition<WriteTextInput, WriteTextResult> = {
  name: "write_text",
  description:
    "Write text on the canvas at a specific position (1280x720). ALWAYS encode spacing with JSON-safe marks: {s}=one space, {n}=new line, {t}=indent (2 spaces). Example: package{s}main{n}{t}name{s}:={s}\"Go\". Do NOT use raw \\s (invalid in JSON and gets corrupted). Do NOT leave literal \\t characters in the text. The executor splits on marks into one clickable word object each. Left: x~80 align=left. Center: x=640. Right: x~1180.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["text", "x", "y"],
    properties: {
      id: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        description:
          "Optional stable group id. Word objects become id_w0, id_w1, ... when there is more than one word. The group id itself remains a highlightable reference for the whole block.",
      },
      text: {
        type: "string",
        minLength: 1,
        maxLength: 600,
        description:
          "Marked text using {s}=space, {n}=newline, {t}=indent. Example: Hi!{s}This{s}will{s}be{s}the{s}new{n}programming{s}class",
      },
      x: { type: "number", description: "Anchor x position in canvas pixels." },
      y: { type: "number", description: "Anchor y position in canvas pixels." },
      fontSize: { type: "number", minimum: 8, maximum: 72, default: 18 },
      fontWeight: {
        type: "string",
        enum: ["normal", "bold"],
        default: "normal",
      },
      align: {
        type: "string",
        enum: ["left", "center", "right"],
        default: "left",
        description: "How x anchors each laid-out line of words.",
      },
      maxWidth: {
        type: "number",
        minimum: 20,
        maximum: 1184,
        description: "Optional wrap width; words wrap to the next row when exceeded.",
      },
      style: {
        type: "object",
        additionalProperties: false,
        properties: {
          stroke: { type: "string" },
          fill: { type: "string", description: "Text color." },
          strokeWidth: { type: "number", minimum: 0, maximum: 20 },
          opacity: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
  resultSchema: {
    type: "object",
    required: ["textId", "text", "bounds", "wordIds"],
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
      wordIds: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  execute(input, state) {
    const fontSize = input.fontSize ?? 18;
    const align = input.align ?? "left";
    const fontWeight = input.fontWeight ?? "normal";
    const groupId = input.id ?? nextObjectId("text");

    removeExistingTextGroup(state, groupId);

    let layout = layoutTextWords({
      groupId,
      text: input.text,
      x: input.x,
      y: input.y,
      fontSize,
      align,
      maxWidth: input.maxWidth,
    });

    const fittedUnion = fitBoundsInCanvas(layout.unionBounds);
    const dx = fittedUnion.x - layout.unionBounds.x;
    const dy = fittedUnion.y - layout.unionBounds.y;
    const clamped = dx !== 0 || dy !== 0;
    if (clamped) {
      layout = offsetLaidOutWords(layout, dx, dy);
    }

    const wordIds = layout.words.map((word) => word.id);
    const exceptIds = new Set<string>([groupId, ...wordIds]);
    const autoErased = clearOverlappingBeforePlace(state, layout.unionBounds, {
      exceptIds: [...exceptIds],
    });

    const style = {
      fill: "#0f172a",
      ...input.style,
    };

    // Multi-word blocks keep a ghost group object so planners can still
    // reference/highlight the whole snippet via the stable group id.
    if (layout.words.length > 1) {
      const groupState = commitObject(state, {
        id: groupId,
        kind: "text",
        text: layout.fullText,
        bounds: layout.unionBounds,
        fontSize,
        fontWeight,
        align,
        maxWidth: input.maxWidth,
        groupId,
        ghost: true,
        style,
      });
      state.objects = groupState.objects;
      state.revision = groupState.revision;
    }

    for (const word of layout.words) {
      const nextState = commitObject(state, {
        id: word.id,
        kind: "text",
        text: word.text,
        bounds: word.bounds,
        fontSize,
        fontWeight,
        align: "left",
        groupId,
        ghost: false,
        style,
      });
      state.objects = nextState.objects;
      state.revision = nextState.revision;
    }

    return {
      textId: groupId,
      text: layout.fullText,
      bounds: layout.unionBounds,
      wordIds,
      autoErased,
      clamped,
    };
  },
};
