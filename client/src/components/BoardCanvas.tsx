import { useEffect, useRef } from "react";
import { drawBoardState } from "../board/drawBoard";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants";
import type { BoardState } from "../types";

interface BoardCanvasProps {
  boardState: BoardState;
  width?: number;
  height?: number;
  activeToolName?: string | null;
}

export function BoardCanvas({
  boardState,
  width = BOARD_WIDTH,
  height = BOARD_HEIGHT,
  activeToolName,
}: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    drawBoardState(context, boardState, width, height);
  }, [boardState, width, height]);

  return (
    <div className="board-canvas-wrap">
      {activeToolName ? (
        <div className="board-status">Drawing: {activeToolName}</div>
      ) : null}
      <canvas
        ref={canvasRef}
        className="board-canvas"
        width={width}
        height={height}
        aria-label="Teaching board canvas"
      />
    </div>
  );
}
