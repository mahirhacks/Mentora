import { useEffect, useState } from "react";
import {
  deleteLearningSession,
  listLearningSessions,
  type SessionSummary,
} from "../api/sessionsApi";

interface HomePageProps {
  onStartLesson: (prompt: string) => void;
  onOpenLesson: (sessionId: string) => void;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HomePage({ onStartLesson, onOpenLesson }: HomePageProps) {
  const [prompt, setPrompt] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const next = await listLearningSessions();
        if (!cancelled) {
          setSessions(next);
        }
      } catch {
        if (!cancelled) {
          setSessions([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }
    onStartLesson(trimmed);
  };

  return (
    <div className="home-shell">
      <aside className="home-sidebar">
        <div className="home-sidebar-top">
          <div className="home-brand">
            <span className="home-brand-mark" />
            <div>
              <strong>Mentora</strong>
              <p>Learning sessions</p>
            </div>
          </div>
          <button
            className="new-lesson-button"
            type="button"
            onClick={() => onStartLesson("")}
          >
            + New lesson
          </button>
        </div>

        <div className="home-session-list">
          {isLoading ? (
            <p className="home-empty">Loading lessons...</p>
          ) : null}
          {!isLoading && sessions.length === 0 ? (
            <p className="home-empty">
              Your previous lessons will appear here.
            </p>
          ) : null}
          {sessions.map((session) => (
            <div key={session.id} className="home-session-row">
              <button
                className="home-session-item"
                type="button"
                onClick={() => onOpenLesson(session.id)}
              >
                <span className="home-session-title">{session.title}</span>
                <span className="home-session-meta">
                  {formatUpdatedAt(session.updatedAt)}
                </span>
                <span className="home-session-preview">{session.preview}</span>
              </button>
              <button
                className="home-session-delete"
                type="button"
                aria-label={`Delete ${session.title}`}
                title="Delete lesson"
                onClick={() => {
                  void (async () => {
                    await deleteLearningSession(session.id);
                    setSessions((current) =>
                      current.filter((entry) => entry.id !== session.id),
                    );
                  })();
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main className="home-main">
        <div className="home-hero">
          <h1>Lets learn something new today!</h1>
          <form
            className="home-prompt"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="What do you want to understand visually?"
              aria-label="Start a new lesson"
            />
            <button
              className="icon-button submit-icon"
              type="submit"
              disabled={!prompt.trim()}
              aria-label="Start lesson"
              title="Start lesson"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </button>
          </form>
          <p className="home-hint">
            Mentora will invent a visual explanation and keep this lesson in
            memory so you can continue later.
          </p>
        </div>
      </main>
    </div>
  );
}
