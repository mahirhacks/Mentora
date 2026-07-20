import { useState, type CSSProperties, type ReactNode } from "react";
import type { UserBoardTool } from "../types";

interface ToolDef {
  id: Exclude<UserBoardTool, "rectangle" | "triangle" | "circle"> | "shape";
  label: string;
  icon: ReactNode;
  shapes?: boolean;
}

const SHAPES = [
  {
    id: "rectangle",
    label: "Rectangle",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="1.5" />
      </svg>
    ),
  },
  {
    id: "triangle",
    label: "Triangle",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4 21 19H3Z" />
      </svg>
    ),
  },
  {
    id: "circle",
    label: "Circle",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
      </svg>
    ),
  },
] as const;

const TOOLS: ToolDef[] = [
  {
    id: "pointer",
    label: "Pointer",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4l7.5 16.5 2-6.5 6.5-2L4 4z" />
        <path d="M13.5 13.5 20 20" />
      </svg>
    ),
  },
  {
    id: "pencil",
    label: "Pencil",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    id: "shape",
    label: "Shapes",
    shapes: true,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <circle cx="17" cy="8" r="4" />
        <path d="M7 21 12 12l5 9H7z" />
      </svg>
    ),
  },
  {
    id: "arrow",
    label: "Arrow",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
    ),
  },
  {
    id: "eraser",
    label: "Eraser",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m7 21-4-4 9.5-9.5a3.2 3.2 0 0 1 4.5 0l3 3a3.2 3.2 0 0 1 0 4.5L12 21H7z" />
        <path d="M10 11 17 18" />
      </svg>
    ),
  },
];

interface ToolWheelerProps {
  selectedTool: UserBoardTool;
  disabled?: boolean;
  onSelectTool: (tool: UserBoardTool) => void;
}

export function ToolWheeler({
  selectedTool,
  disabled = false,
  onSelectTool,
}: ToolWheelerProps) {
  const [wheelOpen, setWheelOpen] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);

  return (
    <div
      className={`tool-wheeler${wheelOpen || shapesOpen ? " is-open" : ""}${shapesOpen ? " is-shapes-open" : ""}${disabled ? " is-disabled" : ""}`}
      aria-label="Drawing tools"
      onMouseEnter={() => setWheelOpen(true)}
      onMouseLeave={() => {
        setWheelOpen(false);
        setShapesOpen(false);
      }}
    >
      <div className="tool-wheeler-disk">
        <span className="tool-wheeler-core" aria-hidden="true" />
        <ul className="tool-wheeler-tools">
          {TOOLS.map((tool, index) => (
            <li
              key={tool.id}
              className={`tool-wheeler-slot${tool.shapes ? " has-shapes" : ""}`}
              style={{ "--slot-index": index } as CSSProperties}
              onMouseEnter={
                tool.shapes ? () => setShapesOpen(true) : undefined
              }
              onMouseLeave={
                tool.shapes ? () => setShapesOpen(false) : undefined
              }
            >
              <div className="tool-wheeler-tool-wrap">
                <button
                  className={`tool-wheeler-tool${
                    (tool.id === "shape"
                      ? ["rectangle", "triangle", "circle"].includes(
                          selectedTool,
                        )
                      : selectedTool === tool.id)
                      ? " is-selected"
                      : ""
                  }`}
                  type="button"
                  title={tool.label}
                  aria-label={tool.label}
                  aria-haspopup={tool.shapes ? "menu" : undefined}
                  aria-expanded={tool.shapes ? shapesOpen : undefined}
                  tabIndex={-1}
                  disabled={disabled}
                  onClick={() =>
                    onSelectTool(
                      tool.id === "shape" ? "rectangle" : tool.id,
                    )
                  }
                >
                  {tool.icon}
                </button>

                {tool.shapes ? (
                  <div
                    className="tool-wheeler-shapes"
                    role="menu"
                    onMouseEnter={() => setShapesOpen(true)}
                    onMouseLeave={() => setShapesOpen(false)}
                  >
                    {SHAPES.map((shape) => (
                      <button
                        key={shape.id}
                        className={`tool-wheeler-shape${
                          selectedTool === shape.id ? " is-selected" : ""
                        }`}
                        type="button"
                        role="menuitem"
                        title={shape.label}
                        aria-label={shape.label}
                        tabIndex={-1}
                        disabled={disabled}
                        onClick={() => onSelectTool(shape.id)}
                      >
                        {shape.icon}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
