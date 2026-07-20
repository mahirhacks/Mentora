import { useEffect, useRef } from "react";

export interface TeachingCanvasProps {
  width?: number;
  height?: number;
  className?: string;
}

export function TeachingCanvas({
  width = 960,
  height = 540,
  className,
}: TeachingCanvasProps) {
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

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "#cbd5e1";
    context.lineWidth = 1;

    for (let x = 0; x <= width; x += 40) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    for (let y = 0; y <= height; y += 40) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    context.fillStyle = "#64748b";
    context.font = "16px Inter, system-ui, sans-serif";
    context.fillText("Teaching board ready", 24, 32);
  }, [width, height]);

  return (
    <section className={className ?? "teaching-canvas-shell"}>
      <header className="teaching-canvas-header">
        <div>
          <p className="teaching-canvas-eyebrow">Mentora</p>
          <h1>Live teaching board</h1>
        </div>
        <span className="teaching-canvas-badge">Canvas preview</span>
      </header>
      <canvas
        ref={canvasRef}
        className="teaching-canvas"
        width={width}
        height={height}
        aria-label="Teaching canvas"
      />
    </section>
  );
}
