import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Arrow, Text, Group } from "react-konva";
import type Konva from "konva";
import type { StudentStroke } from "@mentora/shared";
import { EquationRenderer } from "./EquationRenderer";
import { squareFormulaBoardActions } from "./squareDemo";
import { useBoard } from "./BoardContext";
import { ERASER_RADIUS, useBoardStore } from "../state/boardStore";
import { buildStudentBoardUpdate } from "../teaching/studentBoardBridge";
import { useTeachingStore } from "../state/teachingStore";
import { playUiBeep } from "../state/prefsStore";

const WIDTH = 1100;
const HEIGHT = 620;

type Props = {
  autoPlaySquareDemo?: boolean;
  hideToolbar?: boolean;
  onStudentBoardUpdate?: (
    payload: ReturnType<typeof buildStudentBoardUpdate>,
  ) => void;
};

/** Stage scale-aware pointer → board logical coordinates. */
function getLogicalPointer(
  stage: Konva.Stage | null,
): { x: number; y: number } | null {
  if (!stage) return null;
  const rel = stage.getRelativePointerPosition();
  if (rel) return { x: rel.x, y: rel.y };
  const pos = stage.getPointerPosition();
  if (!pos) return null;
  const sx = stage.scaleX() || 1;
  const sy = stage.scaleY() || 1;
  return { x: pos.x / sx, y: pos.y / sy };
}

export function BoardCanvas({
  autoPlaySquareDemo = false,
  hideToolbar = false,
  onStudentBoardUpdate,
}: Props) {
  const { queue, registry } = useBoard();
  const objects = useBoardStore((s) => s.objects);
  const focus = useBoardStore((s) => s.focus);
  const tool = useBoardStore((s) => s.tool);
  const studentStrokes = useBoardStore((s) => s.studentStrokes);
  const addStudentStroke = useBoardStore((s) => s.addStudentStroke);
  const clearStudentStrokes = useBoardStore((s) => s.clearStudentStrokes);
  const eraseStudentNear = useBoardStore((s) => s.eraseStudentNear);
  const setStudentBoardActive = useBoardStore((s) => s.setStudentBoardActive);
  const setTool = useBoardStore((s) => s.setTool);
  const setObjects = useBoardStore((s) => s.setObjects);
  const setFocus = useBoardStore((s) => s.setFocus);
  const pushStudentPlaced = useBoardStore((s) => s.pushStudentPlaced);
  const removeStudentPlacedIds = useBoardStore((s) => s.removeStudentPlacedIds);
  const patchRuntime = useTeachingStore((s) => s.patchRuntime);

  const drawingRef = useRef<number[] | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<number[] | null>(null);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const [shapePreview, setShapePreview] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const strokeCounter = useRef(0);
  const placeCounter = useRef(0);
  const inkIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStrokes = useRef<StudentStroke[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ width: WIDTH, height: HEIGHT, scale: 1 });

  useEffect(() => {
    if (!autoPlaySquareDemo) return;
    let cancelled = false;
    (async () => {
      await queue.applyActions({ actions: [{ type: "clear_board" }] });
      if (cancelled) return;
      await queue.applyActions({ actions: squareFormulaBoardActions() });
    })();
    return () => {
      cancelled = true;
      queue.interruptDropPending();
    };
  }, [autoPlaySquareDemo, queue]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 2 || h < 2) return;
      const scale = Math.min(w / WIDTH, h / HEIGHT);
      setView({
        width: Math.floor(WIDTH * scale),
        height: Math.floor(HEIGHT * scale),
        scale,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const focusCenter =
    focus.x != null && focus.y != null
      ? { x: focus.x, y: focus.y }
      : focus.objectId
        ? (() => {
            try {
              return registry.centerOf(focus.objectId);
            } catch {
              return null;
            }
          })()
        : null;

  const flushStudentUpdate = () => {
    if (!pendingStrokes.current.length) return;
    const payload = buildStudentBoardUpdate(
      pendingStrokes.current,
      registry,
      "showing_idea",
    );
    patchRuntime({
      pendingStudentStrokeIds: payload.strokeIds,
      studentBoardActive: false,
    });
    onStudentBoardUpdate?.(payload);
    pendingStrokes.current = [];
  };

  const eraseAt = (x: number, y: number) => {
    eraseStudentNear(x, y, ERASER_RADIUS);

    const hitIds = registry.idsHittingCircle(x, y, ERASER_RADIUS);
    if (!hitIds.length) return;

    for (const id of hitIds) {
      try {
        registry.erase(id);
      } catch {
        // already gone
      }
    }
    setObjects(registry.list());
    removeStudentPlacedIds(hitIds);
    patchRuntime({ boardObjectIds: registry.listIds() });

    if (focus.objectId && hitIds.includes(focus.objectId)) {
      setFocus({ kind: null, objectId: null, x: null, y: null, until: 0 });
    }
  };

  const placeObject = async (
    action:
      | {
          type: "draw_rectangle";
          objectId: string;
          x: number;
          y: number;
          width: number;
          height: number;
          stroke: string;
          fill: string;
        }
      | {
          type: "write_text";
          objectId: string;
          x: number;
          y: number;
          text: string;
          fontSize: number;
          fill: string;
        }
      | {
          type: "write_equation";
          objectId: string;
          x: number;
          y: number;
          latex: string;
          fontSize: number;
          fill: string;
        },
  ) => {
    const result = await queue.applyActions({ actions: [action] });
    if (result.success) {
      pushStudentPlaced(action.objectId);
      playUiBeep("click");
      patchRuntime({ boardObjectIds: queue.getRegistry().listIds() });
      onStudentBoardUpdate?.({
        strokeIds: [action.objectId],
        strokeCount: 1,
        nearestObjectIds: [action.objectId],
        intentHint: "showing_idea",
        timestamp: Date.now(),
      });
    }
  };

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = e.target.getStage();
    const pos = getLogicalPointer(stage);
    if (!pos) return;

    if (tool === "text" || tool === "equation") {
      const label =
        tool === "text"
          ? window.prompt("Text to place on the board:")
          : window.prompt("Equation (LaTeX), e.g. a^2 + b^2 = c^2:");
      if (!label?.trim()) return;
      placeCounter.current += 1;
      const objectId = `student_${tool}_${placeCounter.current}`;
      void placeObject(
        tool === "text"
          ? {
              type: "write_text",
              objectId,
              x: pos.x,
              y: pos.y,
              text: label.trim().slice(0, 80),
              fontSize: 22,
              fill: "#164e3b",
            }
          : {
              type: "write_equation",
              objectId,
              x: pos.x,
              y: pos.y,
              latex: label.trim().slice(0, 120),
              fontSize: 24,
              fill: "#164e3b",
            },
      );
      return;
    }

    if (tool === "shapes") {
      setStudentBoardActive(true);
      patchRuntime({ studentBoardActive: true });
      shapeStart.current = { x: pos.x, y: pos.y };
      setShapePreview({ x: pos.x, y: pos.y, width: 1, height: 1 });
      return;
    }

    if (tool !== "pen" && tool !== "eraser") return;
    setStudentBoardActive(true);
    patchRuntime({ studentBoardActive: true });
    if (tool === "eraser") {
      setEraserPos(pos);
      eraseAt(pos.x, pos.y);
      return;
    }
    drawingRef.current = [pos.x, pos.y];
    setDrawingPoints([pos.x, pos.y]);
  };

  const onPointerMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = e.target.getStage();
    const pos = getLogicalPointer(stage);
    if (!pos) return;

    if (tool === "eraser") {
      setEraserPos(pos);
      if (e.evt.buttons === 1) eraseAt(pos.x, pos.y);
      return;
    }

    if (tool === "shapes" && shapeStart.current) {
      const sx = shapeStart.current.x;
      const sy = shapeStart.current.y;
      setShapePreview({
        x: Math.min(sx, pos.x),
        y: Math.min(sy, pos.y),
        width: Math.max(1, Math.abs(pos.x - sx)),
        height: Math.max(1, Math.abs(pos.y - sy)),
      });
      return;
    }

    if (tool !== "pen" || !drawingRef.current) return;
    drawingRef.current = [...drawingRef.current, pos.x, pos.y];
    setDrawingPoints([...drawingRef.current]);
  };

  const onPointerUp = () => {
    if (tool === "shapes" && shapeStart.current && shapePreview) {
      const { x, y, width, height } = shapePreview;
      shapeStart.current = null;
      setShapePreview(null);
      setStudentBoardActive(false);
      if (width >= 8 && height >= 8) {
        placeCounter.current += 1;
        void placeObject({
          type: "draw_rectangle",
          objectId: `student_shape_${placeCounter.current}`,
          x,
          y,
          width,
          height,
          stroke: "#164e3b",
          fill: "rgba(22,78,59,0.08)",
        });
      }
      return;
    }

    if (tool === "pen" && drawingRef.current && drawingRef.current.length >= 4) {
      strokeCounter.current += 1;
      const points = drawingRef.current;
      const xs = points.filter((_, i) => i % 2 === 0);
      const ys = points.filter((_, i) => i % 2 === 1);
      const stroke: StudentStroke = {
        id: `student_stroke_${strokeCounter.current}`,
        points,
        stroke: "#164e3b",
        strokeWidth: 3,
        bounds: {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        },
      };
      addStudentStroke(stroke);
      pendingStrokes.current.push(stroke);
      if (inkIdleTimer.current) clearTimeout(inkIdleTimer.current);
      inkIdleTimer.current = setTimeout(() => flushStudentUpdate(), 550);
    }
    drawingRef.current = null;
    setDrawingPoints(null);
    setStudentBoardActive(false);
  };

  const onPointerLeave = () => {
    setEraserPos(null);
    onPointerUp();
  };

  const cursor =
    tool === "pen"
      ? "crosshair"
      : tool === "eraser"
        ? "none"
        : tool === "text" || tool === "equation"
          ? "text"
          : tool === "shapes"
            ? "crosshair"
            : "default";

  return (
    <div className="board-shell">
      {!hideToolbar && (
        <div className="board-tools">
          {(
            ["pointer", "pen", "eraser", "shapes", "text", "equation"] as const
          ).map((t) => (
            <button
              key={t}
              type="button"
              className={tool === t ? "active" : ""}
              onClick={() => setTool(t)}
            >
              {t}
            </button>
          ))}
          <button type="button" onClick={() => clearStudentStrokes()}>
            clear ink
          </button>
        </div>
      )}

      <div className="board-stage-wrap" ref={wrapRef} style={{ cursor }}>
        <Stage
          width={view.width}
          height={view.height}
          scaleX={view.scale}
          scaleY={view.scale}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        >
          <Layer>
            <Rect width={WIDTH} height={HEIGHT} fill="#ffffff" />
            {Array.from({ length: 12 }).map((_, i) => (
              <Line
                key={`vg-${i}`}
                points={[(WIDTH / 12) * i, 0, (WIDTH / 12) * i, HEIGHT]}
                stroke="rgba(22,78,59,0.06)"
                strokeWidth={1}
              />
            ))}
            {objects.map((obj) => {
              if (!obj.visible) return null;
              if (obj.type === "rectangle") {
                return (
                  <Rect
                    key={obj.id}
                    x={obj.x}
                    y={obj.y}
                    width={obj.width}
                    height={obj.height}
                    stroke={obj.stroke}
                    fill={obj.fill}
                    strokeWidth={obj.strokeWidth}
                  />
                );
              }
              if (obj.type === "circle") {
                return (
                  <Circle
                    key={obj.id}
                    x={obj.x}
                    y={obj.y}
                    radius={obj.radius}
                    stroke={obj.stroke}
                    fill={obj.fill}
                    strokeWidth={obj.strokeWidth}
                  />
                );
              }
              if (obj.type === "line") {
                return (
                  <Line
                    key={obj.id}
                    points={obj.points}
                    stroke={obj.stroke}
                    strokeWidth={obj.strokeWidth}
                  />
                );
              }
              if (obj.type === "arrow") {
                return (
                  <Arrow
                    key={obj.id}
                    points={obj.points ?? []}
                    stroke={obj.stroke}
                    fill={obj.stroke}
                    strokeWidth={obj.strokeWidth}
                  />
                );
              }
              if (obj.type === "text") {
                return (
                  <Text
                    key={obj.id}
                    x={obj.x}
                    y={obj.y}
                    text={obj.text}
                    fontSize={obj.fontSize}
                    fill={obj.fill}
                    fontFamily="Literata, Georgia, serif"
                  />
                );
              }
              return null;
            })}

            {studentStrokes.map((s) => (
              <Line
                key={s.id}
                points={s.points}
                stroke={s.stroke}
                strokeWidth={s.strokeWidth}
                lineCap="round"
                lineJoin="round"
                tension={0.2}
              />
            ))}
            {drawingPoints && (
              <Line
                points={drawingPoints}
                stroke="#164e3b"
                strokeWidth={3}
                lineCap="round"
                lineJoin="round"
                opacity={0.85}
              />
            )}
            {shapePreview && (
              <Rect
                x={shapePreview.x}
                y={shapePreview.y}
                width={shapePreview.width}
                height={shapePreview.height}
                stroke="#164e3b"
                dash={[6, 4]}
                strokeWidth={2}
                fill="rgba(22,78,59,0.06)"
              />
            )}

            {tool === "eraser" && eraserPos && (
              <Circle
                x={eraserPos.x}
                y={eraserPos.y}
                radius={ERASER_RADIUS}
                stroke="#164e3b"
                strokeWidth={1.5}
                dash={[4, 3]}
                fill="rgba(22,78,59,0.08)"
                listening={false}
              />
            )}

            {focus.kind && focusCenter && (
              <Group listening={false}>
                {focus.kind === "highlight" && (
                  <>
                    <Circle
                      x={focusCenter.x}
                      y={focusCenter.y}
                      radius={42}
                      stroke={focus.color ?? "#e11d48"}
                      strokeWidth={2}
                      opacity={0.35}
                    />
                    <Circle
                      x={focusCenter.x}
                      y={focusCenter.y}
                      radius={30}
                      stroke={focus.color ?? "#e11d48"}
                      strokeWidth={3}
                      opacity={0.85}
                    />
                  </>
                )}
                {focus.kind === "point" && (
                  <>
                    {/* Soft red glow rings */}
                    <Circle
                      x={focusCenter.x}
                      y={focusCenter.y}
                      radius={28}
                      fill="rgba(225,29,72,0.12)"
                    />
                    <Circle
                      x={focusCenter.x}
                      y={focusCenter.y}
                      radius={18}
                      fill="rgba(225,29,72,0.22)"
                    />
                    <Circle
                      x={focusCenter.x}
                      y={focusCenter.y}
                      radius={11}
                      fill="rgba(225,29,72,0.45)"
                    />
                    {/* Bright core */}
                    <Circle
                      x={focusCenter.x}
                      y={focusCenter.y}
                      radius={6}
                      fill="#e11d48"
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  </>
                )}
              </Group>
            )}
          </Layer>
        </Stage>
        <EquationRenderer objects={objects} scale={view.scale} />
      </div>
    </div>
  );
}
