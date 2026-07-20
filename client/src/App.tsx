import { useCallback, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { LessonPage } from "./pages/LessonPage";

type AppView =
  | { kind: "home" }
  | {
      kind: "lesson";
      mountId: string;
      sessionId: string | null;
      initialPrompt: string | null;
    };

export function App() {
  const [view, setView] = useState<AppView>({ kind: "home" });

  const openHome = useCallback(() => {
    setView({ kind: "home" });
  }, []);

  const startLesson = useCallback((prompt: string) => {
    setView({
      kind: "lesson",
      mountId: crypto.randomUUID(),
      sessionId: null,
      initialPrompt: prompt.trim() ? prompt.trim() : null,
    });
  }, []);

  const openLesson = useCallback((sessionId: string) => {
    setView({
      kind: "lesson",
      mountId: sessionId,
      sessionId,
      initialPrompt: null,
    });
  }, []);

  if (view.kind === "home") {
    return (
      <HomePage onStartLesson={startLesson} onOpenLesson={openLesson} />
    );
  }

  return (
    <LessonPage
      key={view.mountId}
      sessionId={view.sessionId}
      initialPrompt={view.initialPrompt}
      onBack={openHome}
      onSessionReady={(sessionId) => {
        setView((current) => {
          if (current.kind !== "lesson" || current.sessionId === sessionId) {
            return current;
          }
          return { ...current, sessionId, initialPrompt: null };
        });
      }}
    />
  );
}
