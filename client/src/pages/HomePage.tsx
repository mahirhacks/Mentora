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

const ENCOURAGEMENTS = [
  "Tap in. One visual can unlock the whole idea.",
  "Stuck on something? Let's draw it out together.",
  "Curiosity counts. Start with whatever's on your mind.",
  "You don't need the perfect question — just start.",
  "Hard concepts get easier when you can see them.",
  "Ready when you are. Mentora's here to walk you through it.",
  "Ask anything. We'll build the picture as we go.",
  "Every expert was once confused. Let's clear this up.",
  "Small step, big clarity. Start a lesson.",
  "Bring a doubt. Leave with a mental model.",
];

function pickEncouragement(exclude?: string) {
  const options =
    exclude == null
      ? ENCOURAGEMENTS
      : ENCOURAGEMENTS.filter((line) => line !== exclude);
  const pool = options.length > 0 ? options : ENCOURAGEMENTS;
  return pool[Math.floor(Math.random() * pool.length)] ?? ENCOURAGEMENTS[0];
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
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [encouragement, setEncouragement] = useState(() => pickEncouragement());
  const [lineVisible, setLineVisible] = useState(true);

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

  useEffect(() => {
    let fadeTimer = 0;
    const timer = window.setInterval(() => {
      setLineVisible(false);
      window.clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(() => {
        setEncouragement((current) => pickEncouragement(current));
        setLineVisible(true);
      }, 280);
    }, 4800);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <div
      className={`home-shell home-shell-orb${sidebarOpen ? " sidebar-open" : ""}`}
    >
      <aside className="home-sidebar" aria-label="Lessons">
        <div className="home-sidebar-header">
          {sidebarOpen ? (
            <div className="home-sidebar-brand">
              <strong>Mentora</strong>
            </div>
          ) : null}
          <button
            className="home-sidebar-icon-btn"
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
        </div>

        <button
          className={`home-sidebar-new${sidebarOpen ? " is-expanded" : ""}`}
          type="button"
          onClick={() => onStartLesson("")}
          aria-label="New lesson"
          title="New lesson"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          {sidebarOpen ? <span>New lesson</span> : null}
        </button>

        {sidebarOpen ? (
          <>
            <p className="home-sidebar-section">Lessons</p>
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
          </>
        ) : null}
      </aside>

      <main className="home-main home-main-orb">
        <div className="home-center-stage">
          <p
            className={`home-encourage-line${lineVisible ? " is-visible" : ""}`}
            aria-live="polite"
          >
            {encouragement}
          </p>
          <button
            className="home-center-orb-button"
            type="button"
            onClick={() => onStartLesson("")}
            aria-label="Start a new lesson"
            title="Start a new lesson"
          >
            <span className="home-center-orb-glow" aria-hidden="true" />
            <span className="home-center-orb-core" aria-hidden="true" />
          </button>
        </div>
      </main>
    </div>
  );
}
