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

function clearCanvas(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
}

export function drawBoardState(
  context: CanvasRenderingContext2D,
  boardState: BoardState,
  width: number,
  height: number,
) {
  clearCanvas(context, width, height);

  const objects = Object.values(boardState.objects);
  const layers: BoardObject["kind"][] = [
    "shape",
    "division",
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

      switch (object.kind) {
        case "shape":
          drawShape(context, object);
          break;
        case "division":
          drawDivision(context, object);
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
