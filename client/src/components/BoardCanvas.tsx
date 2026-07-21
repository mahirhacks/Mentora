import { useEffect, useMemo, useRef, useState } from "react";
import { drawBoardState } from "../board/drawBoard";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants";
import type {
  BoardObject,
  BoardState,
  Point,
  UserBoardAction,
  UserBoardTool,
} from "../types";
import {
  BoardSettingsButton,
  type BoardCanvasColor,
} from "./BoardSettingsButton";

interface BoardCanvasProps {
  boardState: BoardState;
  width?: number;
  height?: number;
  activeToolName?: string | null;
  userTool: UserBoardTool;
  disabled?: boolean;
  canvasColor: BoardCanvasColor;
  onCanvasColorChange: (color: BoardCanvasColor) => void;
  onInteractionStart?: () => void;
  onUserAction: (action: UserBoardAction) => Promise<BoardState>;
}

interface DragState {
  start: Point;
  current: Point;
  points: Point[];
  objectId?: string;
}

function distanceToSegment(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - from.x) * dx + (point.y - from.y) * dy) /
        (dx * dx + dy * dy),
    ),
  );
  return Math.hypot(
    point.x - (from.x + t * dx),
    point.y - (from.y + t * dy),
  );
}

function objectHit(object: BoardObject, point: Point) {
  if (object.kind === "text" && object.ghost) {
    return false;
  }
  if (object.kind === "arrow") {
    return distanceToSegment(point, object.from, object.to) <= 12;
  }
  if (
    object.kind === "shape" &&
    object.shape === "line" &&
    object.points &&
    object.points.length > 1
  ) {
    return object.points.some((segmentStart, index) => {
      const segmentEnd = object.points?.[index + 1];
      return (
        Boolean(segmentEnd) &&
        distanceToSegment(point, segmentStart, segmentEnd!) <= 10
      );
    });
  }
  const tolerance = 6;
  return (
    point.x >= object.bounds.x - tolerance &&
    point.x <= object.bounds.x + object.bounds.width + tolerance &&
    point.y >= object.bounds.y - tolerance &&
    point.y <= object.bounds.y + object.bounds.height + tolerance
  );
}

function hitTest(boardState: BoardState, point: Point) {
  const objects = Object.values(boardState.objects);
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    if (objectHit(objects[index], point)) {
      return objects[index];
    }
  }
  return null;
}

function boundsFromPoints(points: Point[], padding = 0) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  };
}

function translatedObject(object: BoardObject, dx: number, dy: number) {
  const translated = structuredClone(object);
  translated.bounds.x += dx;
  translated.bounds.y += dy;
  if (translated.kind === "shape" && translated.points) {
    translated.points = translated.points.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    }));
  } else if (translated.kind === "pointer") {
    translated.tip = {
      x: translated.tip.x + dx,
      y: translated.tip.y + dy,
    };
  } else if (translated.kind === "arrow") {
    translated.from = {
      x: translated.from.x + dx,
      y: translated.from.y + dy,
    };
    translated.to = {
      x: translated.to.x + dx,
      y: translated.to.y + dy,
    };
  }
  return translated;
}

function previewState(
  boardState: BoardState,
  tool: UserBoardTool,
  drag: DragState | null,
): BoardState {
  if (!drag) {
    return boardState;
  }
  const state = structuredClone(boardState);
  const style = {
    stroke: "#1f7a4d",
    fill: "rgba(31, 122, 77, 0.08)",
    strokeWidth: 3,
    opacity: 0.78,
  };

  if (tool === "pointer" && drag.objectId) {
    const object = state.objects[drag.objectId];
    if (object) {
      state.objects[drag.objectId] = translatedObject(
        object,
        drag.current.x - drag.start.x,
        drag.current.y - drag.start.y,
      );
    }
    return state;
  }

  if (tool === "pencil" && drag.points.length > 1) {
    state.objects.__user_preview = {
      id: "__user_preview",
      kind: "shape",
      shape: "line",
      bounds: boundsFromPoints(drag.points, 3),
      points: drag.points,
      style,
      createdBy: "user",
      updatedBy: "user",
    };
    return state;
  }

  if (tool === "arrow") {
    state.objects.__user_preview = {
      id: "__user_preview",
      kind: "arrow",
      from: drag.start,
      to: drag.current,
      bounds: boundsFromPoints([drag.start, drag.current], 12),
      style,
      createdBy: "user",
      updatedBy: "user",
    };
    return state;
  }

  if (tool === "rectangle" || tool === "triangle" || tool === "circle") {
    const minX = Math.min(drag.start.x, drag.current.x);
    const minY = Math.min(drag.start.y, drag.current.y);
    const width = Math.max(1, Math.abs(drag.current.x - drag.start.x));
    const height = Math.max(1, Math.abs(drag.current.y - drag.start.y));
    if (tool === "circle") {
      const size = Math.max(width, height);
      state.objects.__user_preview = {
        id: "__user_preview",
        kind: "shape",
        shape: "ellipse",
        bounds: {
          x: drag.current.x >= drag.start.x ? drag.start.x : drag.start.x - size,
          y: drag.current.y >= drag.start.y ? drag.start.y : drag.start.y - size,
          width: size,
          height: size,
        },
        style,
        createdBy: "user",
        updatedBy: "user",
      };
    } else {
      const bounds = { x: minX, y: minY, width, height };
      state.objects.__user_preview = {
        id: "__user_preview",
        kind: "shape",
        shape: tool === "triangle" ? "polygon" : "rectangle",
        bounds,
        points:
          tool === "triangle"
            ? [
                { x: bounds.x + bounds.width / 2, y: bounds.y },
                {
                  x: bounds.x + bounds.width,
                  y: bounds.y + bounds.height,
                },
                { x: bounds.x, y: bounds.y + bounds.height },
              ]
            : undefined,
        style,
        createdBy: "user",
        updatedBy: "user",
      };
    }
  }
  return state;
}

export function BoardCanvas({
  boardState,
  width = BOARD_WIDTH,
  height = BOARD_HEIGHT,
  activeToolName,
  userTool,
  disabled = false,
  canvasColor,
  onCanvasColorChange,
  onInteractionStart,
  onUserAction,
}: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const renderedState = useMemo(
    () => previewState(boardState, userTool, drag),
    [boardState, drag, userTool],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    drawBoardState(context, renderedState, width, height, {
      backgroundColor: canvasColor,
      showGrid,
    });
    const selected =
      selectedObjectId && renderedState.objects[selectedObjectId];
    if (selected) {
      context.save();
      context.strokeStyle = "#1f7a4d";
      context.lineWidth = 2;
      context.setLineDash([7, 5]);
      context.strokeRect(
        selected.bounds.x - 5,
        selected.bounds.y - 5,
        selected.bounds.width + 10,
        selected.bounds.height + 10,
      );
      context.restore();
    }
  }, [canvasColor, height, renderedState, selectedObjectId, showGrid, width]);

  useEffect(() => {
    if (selectedObjectId && !boardState.objects[selectedObjectId]) {
      setSelectedObjectId(null);
    }
  }, [boardState, selectedObjectId]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * width),
      y: Math.round(((event.clientY - rect.top) / rect.height) * height),
    };
  };

  const commit = async (action: UserBoardAction) => {
    setIsCommitting(true);
    try {
      await onUserAction(action);
    } catch (error) {
      console.warn(
        "Board edit was rejected:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      setDrag(null);
      setIsCommitting(false);
    }
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (disabled || isCommitting) {
      return;
    }
    onInteractionStart?.();
    const point = pointFromEvent(event);
    const hit = hitTest(boardState, point);

    if (userTool === "eraser") {
      if (hit) {
        setSelectedObjectId(null);
        void commit({ type: "erase", objectId: hit.id });
      }
      return;
    }

    if (userTool === "pointer") {
      setSelectedObjectId(hit?.id ?? null);
      if (!hit) {
        return;
      }
      setDrag({
        start: point,
        current: point,
        points: [point],
        objectId: hit.id,
      });
    } else {
      setSelectedObjectId(null);
      setDrag({
        start: point,
        current: point,
        points: [point],
      });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (!drag || disabled || isCommitting) {
      return;
    }
    const point = pointFromEvent(event);
    setDrag((current) =>
      current
        ? {
            ...current,
            current: point,
            points:
              userTool === "pencil"
                ? [...current.points, point].slice(-256)
                : current.points,
          }
        : null,
    );
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (!drag || disabled || isCommitting) {
      return;
    }
    const point = pointFromEvent(event);
    const distance = Math.hypot(
      point.x - drag.start.x,
      point.y - drag.start.y,
    );
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (userTool === "pointer" && drag.objectId) {
      if (distance < 2) {
        setDrag(null);
        return;
      }
      void commit({
        type: "move",
        objectId: drag.objectId,
        dx: point.x - drag.start.x,
        dy: point.y - drag.start.y,
      });
      return;
    }
    if (distance < 4) {
      setDrag(null);
      return;
    }
    if (userTool === "pencil") {
      void commit({ type: "pencil", points: [...drag.points, point] });
    } else if (userTool === "arrow") {
      void commit({ type: "arrow", from: drag.start, to: point });
    } else if (
      userTool === "rectangle" ||
      userTool === "triangle" ||
      userTool === "circle"
    ) {
      void commit({
        type: "shape",
        shape: userTool,
        from: drag.start,
        to: point,
      });
    } else {
      setDrag(null);
    }
  };

  return (
    <div className="board-canvas-wrap">
      <BoardSettingsButton
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((current) => !current)}
        canvasColor={canvasColor}
        onCanvasColorChange={onCanvasColorChange}
      />
      {activeToolName ? (
        <div className="board-status">Drawing: {activeToolName}</div>
      ) : null}
      <canvas
        ref={canvasRef}
        className="board-canvas"
        width={width}
        height={height}
        aria-label="Teaching board canvas"
        data-user-tool={userTool}
        style={{ background: canvasColor }}
        aria-disabled={disabled || isCommitting}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDrag(null)}
      />
    </div>
  );
}
