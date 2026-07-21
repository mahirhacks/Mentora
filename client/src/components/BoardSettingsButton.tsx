import { useEffect, useRef, useState } from "react";

export const BOARD_CANVAS_COLORS = [
  { id: "paper", label: "Paper", value: "#f7f7f8" },
  { id: "cream", label: "Cream", value: "#f3efe6" },
  { id: "slate", label: "Slate", value: "#e8eef5" },
] as const;

export type BoardCanvasColor = (typeof BOARD_CANVAS_COLORS)[number]["value"];

interface BoardSettingsButtonProps {
  showGrid: boolean;
  onToggleGrid: () => void;
  canvasColor: BoardCanvasColor;
  onCanvasColorChange: (color: BoardCanvasColor) => void;
}

export function BoardSettingsButton({
  showGrid,
  onToggleGrid,
  canvasColor,
  onCanvasColorChange,
}: BoardSettingsButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const colorCloseTimerRef = useRef<number | null>(null);

  const clearColorCloseTimer = () => {
    if (colorCloseTimerRef.current !== null) {
      window.clearTimeout(colorCloseTimerRef.current);
      colorCloseTimerRef.current = null;
    }
  };

  const openColors = () => {
    clearColorCloseTimer();
    setColorOpen(true);
  };

  const scheduleCloseColors = () => {
    clearColorCloseTimer();
    colorCloseTimerRef.current = window.setTimeout(() => {
      colorCloseTimerRef.current = null;
      setColorOpen(false);
    }, 100);
  };

  useEffect(() => {
    return () => clearColorCloseTimer();
  }, []);

  return (
    <div
      className={`board-settings${expanded ? " is-expanded" : ""}${colorOpen ? " is-color-open" : ""}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => {
        clearColorCloseTimer();
        setExpanded(false);
        setColorOpen(false);
      }}
    >
      <div className="board-settings-pill">
        <span
          className="board-settings-slot board-settings-gear"
          aria-hidden="true"
          onMouseEnter={() => setColorOpen(false)}
        >
          <svg viewBox="0 0 24 24">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>

        <div className="board-settings-actions">
          <button
            type="button"
            className={`board-settings-slot board-settings-action${showGrid ? " is-active" : ""}`}
            aria-pressed={showGrid}
            aria-label={showGrid ? "Turn grid off" : "Turn grid on"}
            title={showGrid ? "Turn grid off" : "Turn grid on"}
            onMouseEnter={() => setColorOpen(false)}
            onClick={onToggleGrid}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4h16v16H4z" />
              <path d="M4 10h16" />
              <path d="M4 16h16" />
              <path d="M10 4v16" />
              <path d="M16 4v16" />
            </svg>
          </button>

          <button
            type="button"
            className={`board-settings-slot board-settings-action${colorOpen ? " is-active" : ""}`}
            aria-label="Change canvas color"
            aria-expanded={colorOpen}
            title="Change canvas color"
            onMouseEnter={openColors}
            onMouseLeave={scheduleCloseColors}
            onFocus={openColors}
            onBlur={scheduleCloseColors}
            onClick={() => setColorOpen((current) => !current)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3a9 9 0 0 0 0 18c.8 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.2-.3-.3-.6-.3-1a1.5 1.5 0 0 1 1.5-1.5H16a5 5 0 0 0 0-10h-.5" />
              <circle cx="7.5" cy="11" r="1.2" />
              <circle cx="10.5" cy="7.5" r="1.2" />
              <circle cx="14.5" cy="7.5" r="1.2" />
              <circle cx="17" cy="11" r="1.2" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="board-settings-colors"
        role="listbox"
        aria-label="Canvas colors"
        aria-hidden={!colorOpen}
        onMouseEnter={openColors}
        onMouseLeave={scheduleCloseColors}
      >
        {BOARD_CANVAS_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            role="option"
            tabIndex={colorOpen ? 0 : -1}
            className={`board-settings-swatch${canvasColor === color.value ? " is-selected" : ""}`}
            style={{ background: color.value }}
            aria-selected={canvasColor === color.value}
            aria-label={color.label}
            title={color.label}
            onClick={() => {
              onCanvasColorChange(color.value);
              setColorOpen(false);
            }}
          />
        ))}
      </div>
    </div>
  );
}
