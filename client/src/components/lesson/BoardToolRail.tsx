import { useBoardStore } from "../../state/boardStore";

const TOOLS = [
  { id: "pointer", label: "Pointer", icon: "↖" },
  { id: "pen", label: "Pen", icon: "✎" },
  { id: "shapes", label: "Shapes", icon: "◻" },
  { id: "text", label: "Text", icon: "T" },
  { id: "equation", label: "Equation", icon: "√x" },
  { id: "eraser", label: "Eraser", icon: "⌫" },
] as const;

type Props = {
  onUndo?: () => void;
  onResetInk?: () => void;
  onReplay?: () => void;
};

export function BoardToolRail({ onUndo, onResetInk, onReplay }: Props) {
  const tool = useBoardStore((s) => s.tool);
  const setTool = useBoardStore((s) => s.setTool);

  return (
    <aside className="board-tool-rail" aria-label="Whiteboard tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? "active" : ""}
          title={
            t.id === "shapes"
              ? "Drag to draw a rectangle"
              : t.id === "text" || t.id === "equation"
                ? "Click the board to place"
                : t.label
          }
          onClick={() => setTool(t.id)}
        >
          <span className="tool-icon">{t.icon}</span>
          <span className="tool-label">{t.label}</span>
        </button>
      ))}
      <div className="rail-spacer" />
      <button type="button" title="Undo last stroke or shape" onClick={onUndo}>
        <span className="tool-icon">↶</span>
        <span className="tool-label">Undo</span>
      </button>
      <button type="button" title="Reset ink" onClick={onResetInk}>
        <span className="tool-icon">↺</span>
        <span className="tool-label">Reset</span>
      </button>
      <button type="button" title="Replay board seed" onClick={onReplay}>
        <span className="tool-icon">▶</span>
        <span className="tool-label">Replay</span>
      </button>
    </aside>
  );
}
