import type { BoardObject, BoardState } from "../types";

function applyStyle(
  context: CanvasRenderingContext2D,
  style: BoardObject["style"] | undefined,
  defaults: { stroke: string; fill: string; strokeWidth: number },
) {
  context.strokeStyle = style?.stroke ?? defaults.stroke;
  context.fillStyle = style?.fill ?? defaults.fill;
  context.lineWidth = style?.strokeWidth ?? defaults.strokeWidth;
  context.globalAlpha = style?.opacity ?? 1;
}

function drawShape(context: CanvasRenderingContext2D, object: BoardObject) {
  if (object.kind !== "shape") {
    return;
  }

  applyStyle(context, object.style, {
    stroke: "#1e293b",
    fill: "rgba(59, 130, 246, 0.15)",
    strokeWidth: 2,
  });

  const { x, y, width, height } = object.bounds;

  if (object.shape === "rectangle") {
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
    return;
  }

  if (object.shape === "ellipse") {
    context.beginPath();
    context.ellipse(
      x + width / 2,
      y + height / 2,
      width / 2,
      height / 2,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.stroke();
    return;
  }

  if (object.shape === "line" && object.points && object.points.length >= 2) {
    context.beginPath();
    context.moveTo(object.points[0].x, object.points[0].y);
    for (let index = 1; index < object.points.length; index += 1) {
      context.lineTo(object.points[index].x, object.points[index].y);
    }
    context.stroke();
    return;
  }

  if (object.shape === "polygon" && object.points && object.points.length >= 3) {
    context.beginPath();
    context.moveTo(object.points[0].x, object.points[0].y);
    for (let index = 1; index < object.points.length; index += 1) {
      context.lineTo(object.points[index].x, object.points[index].y);
    }
    context.closePath();
    context.fill();
    context.stroke();
  }
}

function drawDivision(context: CanvasRenderingContext2D, object: BoardObject) {
  if (object.kind !== "division") {
    return;
  }

  applyStyle(context, object.style, {
    stroke: "#64748b",
    fill: "rgba(148, 163, 184, 0.12)",
    strokeWidth: 1,
  });

  const { x, y, width, height } = object.bounds;
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);
}

function drawTextLike(
  context: CanvasRenderingContext2D,
  object: BoardObject,
) {
  if (object.kind !== "text" && object.kind !== "label") {
    return;
  }

  const fontSize = object.kind === "text" ? (object.fontSize ?? 18) : 16;
  const fontWeight =
    object.kind === "text" && object.fontWeight === "bold" ? "bold " : "";
  context.font = `${fontWeight}${fontSize}px Inter, system-ui, sans-serif`;
  context.fillStyle = object.style?.fill ?? "#0f172a";
  context.textBaseline = "middle";

  const { x, y, width, height } = object.bounds;
  const align =
    object.kind === "text" ? (object.align ?? "left") : "center";
  let drawX = x;
  if (align === "center") {
    context.textAlign = "center";
    drawX = x + width / 2;
  } else if (align === "right") {
    context.textAlign = "right";
    drawX = x + width;
  } else {
    context.textAlign = "left";
  }

  const lines = object.text.split("\n");
  const lineHeight = Math.round(fontSize * 1.35);
  const blockHeight = lines.length * lineHeight;
  const startY = y + (height - blockHeight) / 2 + lineHeight / 2;

  for (const [index, line] of lines.entries()) {
    context.fillText(line, drawX, startY + index * lineHeight);
  }
  context.textAlign = "left";
}

function drawHighlight(context: CanvasRenderingContext2D, object: BoardObject) {
  if (object.kind !== "highlight") {
    return;
  }

  applyStyle(context, object.style, {
    stroke: "#f59e0b",
    fill: "rgba(245, 158, 11, 0.18)",
    strokeWidth: 3,
  });

  const { x, y, width, height } = object.bounds;
  context.strokeRect(x, y, width, height);
  context.fillRect(x, y, width, height);
}

function drawPointer(context: CanvasRenderingContext2D, object: BoardObject) {
  if (object.kind !== "pointer") {
    return;
  }

  const color = object.style?.fill ?? "#ef4444";
  context.fillStyle = color;
  context.strokeStyle = object.style?.stroke ?? color;
  context.lineWidth = object.style?.strokeWidth ?? 2;

  const { x, y } = object.tip;
  context.beginPath();
  context.arc(x, y, 8, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  if (object.label) {
    context.font = "14px Inter, system-ui, sans-serif";
    context.fillStyle = "#0f172a";
    context.fillText(object.label, x + 12, y - 12);
  }
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  size = 12,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(
    to.x - size * Math.cos(angle - Math.PI / 6),
    to.y - size * Math.sin(angle - Math.PI / 6),
  );
  context.lineTo(
    to.x - size * Math.cos(angle + Math.PI / 6),
    to.y - size * Math.sin(angle + Math.PI / 6),
  );
  context.closePath();
  context.fill();
  context.stroke();
}

function drawArrow(context: CanvasRenderingContext2D, object: BoardObject) {
  if (object.kind !== "arrow") {
    return;
  }

  const color = object.style?.stroke ?? "#2563eb";
  context.strokeStyle = color;
  context.fillStyle = object.style?.fill ?? color;
  context.lineWidth = object.style?.strokeWidth ?? 2.5;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = object.style?.opacity ?? 1;

  context.beginPath();
  context.moveTo(object.from.x, object.from.y);
  context.lineTo(object.to.x, object.to.y);
  context.stroke();

  drawArrowHead(context, object.from, object.to);
  if (object.bidirectional) {
    drawArrowHead(context, object.to, object.from);
  }

  if (object.label) {
    const midX = (object.from.x + object.to.x) / 2;
    const midY = (object.from.y + object.to.y) / 2;
    context.font = "14px Inter, system-ui, sans-serif";
    context.fillStyle = "#0f172a";
    context.textAlign = "center";
    context.fillText(object.label, midX, midY - 10);
    context.textAlign = "left";
  }
}

function clearCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundColor = "#f7f7f8",
) {
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, width, height);
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundColor: string,
) {
  const step = 40;
  // Slightly stronger lines on lighter boards, softer on darker ones.
  const luminance = backgroundLuminance(backgroundColor);
  context.save();
  context.strokeStyle =
    luminance > 0.55 ? "rgba(15, 23, 42, 0.08)" : "rgba(255, 255, 255, 0.1)";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = step; x < width; x += step) {
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
  }
  for (let y = step; y < height; y += step) {
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
  }
  context.stroke();
  context.restore();
}

function backgroundLuminance(color: string) {
  const hex = color.replace("#", "");
  if (hex.length !== 6) {
    return 0.9;
  }
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface DrawBoardOptions {
  backgroundColor?: string;
  showGrid?: boolean;
}

export function drawBoardState(
  context: CanvasRenderingContext2D,
  boardState: BoardState,
  width: number,
  height: number,
  options: DrawBoardOptions = {},
) {
  const backgroundColor = options.backgroundColor ?? "#f7f7f8";
  clearCanvas(context, width, height, backgroundColor);
  if (options.showGrid) {
    drawGrid(context, width, height, backgroundColor);
  }

  const objects = Object.values(boardState.objects);
  const layers: BoardObject["kind"][] = [
    "shape",
    "division",
    "arrow",
    "label",
    "text",
    "highlight",
    "pointer",
  ];

  for (const kind of layers) {
    for (const object of objects) {
      if (object.kind !== kind) {
        continue;
      }
      if (object.kind === "text" && object.ghost) {
        continue;
      }

      switch (object.kind) {
        case "shape":
          drawShape(context, object);
          break;
        case "division":
          drawDivision(context, object);
          break;
        case "arrow":
          drawArrow(context, object);
          break;
        case "label":
        case "text":
          drawTextLike(context, object);
          break;
        case "highlight":
          drawHighlight(context, object);
          break;
        case "pointer":
          drawPointer(context, object);
          break;
      }
    }
  }

  context.globalAlpha = 1;
}
