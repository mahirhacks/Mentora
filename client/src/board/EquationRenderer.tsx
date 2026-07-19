import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { BoardObject } from "./ObjectRegistry";

type Props = {
  objects: BoardObject[];
  scale?: number;
};

export function EquationRenderer({ objects, scale = 1 }: Props) {
  const equations = useMemo(
    () => objects.filter((o) => o.type === "equation" && o.visible),
    [objects],
  );

  return (
    <div className="equation-layer" aria-hidden>
      {equations.map((eq) => {
        let html = eq.latex ?? "";
        try {
          html = katex.renderToString(eq.latex ?? "", {
            throwOnError: false,
            displayMode: false,
          });
        } catch {
          html = eq.latex ?? "";
        }
        return (
          <div
            key={eq.id}
            className="equation-item"
            style={{
              left: (eq.x ?? 0) * scale,
              top: (eq.y ?? 0) * scale,
              color: eq.fill ?? "#164e3b",
              fontSize: (eq.fontSize ?? 28) * scale,
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
}
