import type { Bounds } from "./types.js";

export interface LaidOutWord {
  id: string;
  text: string;
  lineIndex: number;
  wordIndex: number;
  bounds: Bounds;
}

export interface TextLayoutResult {
  groupId: string;
  words: LaidOutWord[];
  unionBounds: Bounds;
  fullText: string;
}

export interface MarkedRow {
  indentSpaces: number;
  tokens: string[];
}

/**
 * Approximate Inter / system-ui advance widths used by the client canvas.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const char of text) {
    if (char === " " || char === "\t") {
      units += char === "\t" ? 1.5 : 0.33;
    } else if ("iIlj.,:;|'!`".includes(char)) {
      units += 0.28;
    } else if ("mwMW@%".includes(char)) {
      units += 0.82;
    } else if (char >= "A" && char <= "Z") {
      units += 0.66;
    } else if (char >= "0" && char <= "9") {
      units += 0.56;
    } else if ("()[]{}".includes(char)) {
      units += 0.4;
    } else if (char === '"' || char === "'") {
      units += 0.3;
    } else {
      units += 0.52;
    }
  }
  return Math.max(Math.ceil(units * fontSize), Math.ceil(fontSize * 0.3));
}

function estimateWordSize(text: string, fontSize: number) {
  const lineHeight = Math.round(fontSize * 1.35);
  return {
    width: estimateTextWidth(text, fontSize),
    height: lineHeight,
  };
}

type MarkKind = "space" | "newline" | "tab";

/**
 * Mentora text marks. Prefer {s}/{n}/{t} because raw \s is NOT valid JSON and
 * gets corrupted in tool calls. Also accept legacy \s \n \t two-char forms and
 * real whitespace/newlines/tabs.
 */
function matchMarkAt(
  text: string,
  index: number,
): { kind: MarkKind; length: number } | null {
  const brace = text.slice(index, index + 3).toLowerCase();
  if (brace === "{s}") {
    return { kind: "space", length: 3 };
  }
  if (brace === "{n}") {
    return { kind: "newline", length: 3 };
  }
  if (brace === "{t}") {
    return { kind: "tab", length: 3 };
  }

  if (text[index] === "\\" && index + 1 < text.length) {
    const code = text[index + 1].toLowerCase();
    if (code === "s") {
      return { kind: "space", length: 2 };
    }
    if (code === "n") {
      return { kind: "newline", length: 2 };
    }
    if (code === "t") {
      return { kind: "tab", length: 2 };
    }
  }

  return null;
}

/** Convert marked text into a human-readable string for group summaries. */
export function normalizeMarkedText(text: string): string {
  let output = "";
  for (let index = 0; index < text.length; ) {
    const mark = matchMarkAt(text, index);
    if (mark) {
      if (mark.kind === "space") {
        output += " ";
      } else if (mark.kind === "newline") {
        output += "\n";
      } else {
        output += "  ";
      }
      index += mark.length;
      continue;
    }
    output += text[index];
    index += 1;
  }
  return output;
}

/**
 * Parse Mentora marked text into rows of words.
 * Preferred marks (JSON-safe): {s}=space, {n}=newline, {t}=indent tab (2 spaces).
 * Legacy: \s \n \t and real whitespace still work.
 */
export function parseMarkedRows(text: string): MarkedRow[] {
  const rows: MarkedRow[] = [];
  let tokens: string[] = [];
  let indentSpaces = 0;
  let buffer = "";
  let seenWordOnRow = false;

  const flushWord = () => {
    if (buffer.length === 0) {
      return;
    }
    tokens.push(buffer);
    buffer = "";
    seenWordOnRow = true;
  };

  const flushRow = () => {
    flushWord();
    rows.push({ indentSpaces, tokens });
    tokens = [];
    indentSpaces = 0;
    seenWordOnRow = false;
  };

  const applySpaceOrIndent = (spaces = 1) => {
    if (buffer.length > 0) {
      flushWord();
      return;
    }
    if (!seenWordOnRow) {
      indentSpaces += spaces;
    }
  };

  for (let index = 0; index < text.length; ) {
    const mark = matchMarkAt(text, index);
    if (mark) {
      if (mark.kind === "space") {
        applySpaceOrIndent(1);
      } else if (mark.kind === "tab") {
        applySpaceOrIndent(2);
      } else {
        flushRow();
      }
      index += mark.length;
      continue;
    }

    const char = text[index];

    if (char === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }
      flushRow();
      index += 1;
      continue;
    }

    if (char === "\n") {
      flushRow();
      index += 1;
      continue;
    }

    if (char === "\t") {
      applySpaceOrIndent(2);
      index += 1;
      continue;
    }

    if (char === " ") {
      applySpaceOrIndent(1);
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flushWord();
  if (tokens.length > 0 || indentSpaces > 0 || rows.length === 0) {
    rows.push({ indentSpaces, tokens });
  }

  return rows;
}

function unionBounds(boundsList: Bounds[]): Bounds {
  if (boundsList.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const bounds of boundsList) {
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/**
 * Expand marked / multi-word text into individually placed word boxes.
 */
export function layoutTextWords(input: {
  groupId: string;
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  align?: "left" | "center" | "right";
  maxWidth?: number;
}): TextLayoutResult {
  const fontSize = input.fontSize ?? 18;
  const align = input.align ?? "left";
  const lineHeight = Math.round(fontSize * 1.35);
  const wordGap = Math.max(
    estimateTextWidth(" ", fontSize),
    Math.round(fontSize * 0.33),
  );
  const spaceWidth = wordGap;
  const rows = parseMarkedRows(input.text);
  const words: LaidOutWord[] = [];

  let cursorY = input.y;
  let globalWordIndex = 0;
  const nonEmptyRowCount = rows.filter((row) => row.tokens.length > 0).length;

  for (let lineIndex = 0; lineIndex < rows.length; lineIndex += 1) {
    const row = rows[lineIndex];
    if (row.tokens.length === 0) {
      cursorY += lineHeight;
      continue;
    }

    const indentWidth = row.indentSpaces * spaceWidth;
    const sizes = row.tokens.map((token) => estimateWordSize(token, fontSize));
    const contentWidth =
      sizes.reduce((sum, size) => sum + size.width, 0) +
      wordGap * Math.max(row.tokens.length - 1, 0);
    const rowWidth = indentWidth + contentWidth;

    const rowOriginX =
      align === "center"
        ? input.x - rowWidth / 2
        : align === "right"
          ? input.x - rowWidth
          : input.x;

    let cursorX = rowOriginX + indentWidth;

    for (let index = 0; index < row.tokens.length; index += 1) {
      const token = row.tokens[index];
      const size = sizes[index];
      const wordId =
        nonEmptyRowCount === 1 && row.tokens.length === 1
          ? input.groupId
          : `${input.groupId}_w${globalWordIndex}`;

      words.push({
        id: wordId,
        text: token,
        lineIndex,
        wordIndex: globalWordIndex,
        bounds: {
          x: Math.round(cursorX),
          y: Math.round(cursorY),
          width: size.width,
          height: size.height,
        },
      });

      cursorX += size.width + wordGap;
      globalWordIndex += 1;
    }

    cursorY += lineHeight;
  }

  if (words.length === 0) {
    const readable = normalizeMarkedText(input.text).trim() || " ";
    const size = estimateWordSize(readable, fontSize);
    words.push({
      id: input.groupId,
      text: readable,
      lineIndex: 0,
      wordIndex: 0,
      bounds: {
        x: input.x,
        y: input.y,
        width: size.width,
        height: size.height,
      },
    });
  }

  return {
    groupId: input.groupId,
    words,
    unionBounds: unionBounds(words.map((word) => word.bounds)),
    fullText: normalizeMarkedText(input.text),
  };
}

export function offsetLaidOutWords(
  layout: TextLayoutResult,
  dx: number,
  dy: number,
): TextLayoutResult {
  if (dx === 0 && dy === 0) {
    return layout;
  }
  const words = layout.words.map((word) => ({
    ...word,
    bounds: {
      ...word.bounds,
      x: word.bounds.x + dx,
      y: word.bounds.y + dy,
    },
  }));
  return {
    ...layout,
    words,
    unionBounds: {
      ...layout.unionBounds,
      x: layout.unionBounds.x + dx,
      y: layout.unionBounds.y + dy,
    },
  };
}
