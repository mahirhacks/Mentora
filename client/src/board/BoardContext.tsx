import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { BoardObjectRegistry } from "./ObjectRegistry";
import { BoardActionQueue } from "./ActionQueue";
import { useBoardStore } from "../state/boardStore";

type BoardContextValue = {
  registry: BoardObjectRegistry;
  queue: BoardActionQueue;
};

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const setObjects = useBoardStore((s) => s.setObjects);
  const setFocus = useBoardStore((s) => s.setFocus);
  const clearStudentStrokes = useBoardStore((s) => s.clearStudentStrokes);
  const clearStudentPlaced = useBoardStore((s) => s.clearStudentPlaced);
  const registryRef = useRef(new BoardObjectRegistry());

  const value = useMemo(() => {
    const registry = registryRef.current;
    const queue = new BoardActionQueue(registry, {
      onRegistryChange: () => setObjects(registry.list()),
      onFocusChange: setFocus,
      onClearStudentLayer: () => {
        clearStudentStrokes();
        clearStudentPlaced();
        for (const obj of registry.list()) {
          if (obj.layer === "student") {
            try {
              registry.erase(obj.id);
            } catch {
              // ignore
            }
          }
        }
        setObjects(registry.list());
      },
    });
    return { registry, queue };
  }, [setObjects, setFocus, clearStudentStrokes, clearStudentPlaced]);

  return (
    <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
  );
}

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within BoardProvider");
  return ctx;
}
