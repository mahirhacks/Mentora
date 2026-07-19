import { useEffect, useState } from "react";
import { useSessionStore } from "../../state/sessionStore";
import { useTeachingStore } from "../../state/teachingStore";
import { useLessonUiStore } from "../../state/lessonUiStore";

export function MentoraSidebar() {
  const voiceUi = useSessionStore((s) => s.voiceUi);
  const plan = useTeachingStore((s) => s.plan);
  const runtime = useTeachingStore((s) => s.runtime);
  const tab = useLessonUiStore((s) => s.sidebarTab);
  const setTab = useLessonUiStore((s) => s.setSidebarTab);
  const transcript = useLessonUiStore((s) => s.transcript);
  const notes = useLessonUiStore((s) => s.notes);
  const setNotes = useLessonUiStore((s) => s.setNotes);
  const understandingPct = Math.round(runtime.understanding * 100);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!runtime.startedAt || runtime.phase === "complete") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [runtime.startedAt, runtime.phase]);

  const elapsed = runtime.startedAt
    ? formatTime(now - runtime.startedAt)
    : "00:00";

  const status =
    voiceUi === "speaking"
      ? "Teaching • Live"
      : voiceUi === "listening"
        ? "Listening • Live"
        : voiceUi === "thinking"
          ? "Thinking…"
          : voiceUi === "waiting"
            ? "Waiting for you"
            : "Ready • Live";

  const encourage =
    understandingPct >= 80
      ? "Excellent grasp — you're ready for the next challenge."
      : understandingPct >= 55
        ? "Solid progress! Keep answering and drawing."
        : understandingPct >= 25
          ? "You're building it — speak up or sketch your idea."
          : runtime.phase === "waiting_for_student"
            ? "Your turn — answer out loud or draw on the board."
            : "Let's learn together — Mentora has your back.";

  return (
    <aside className="mentora-sidebar">
      <div className="teacher-card">
        <div className={`robot-avatar pulse-${voiceUi}`}>
          <div className="robot-face" />
          <div className="avatar-ring" />
        </div>
        <div>
          <strong>Mentora AI</strong>
          <p>
            <i className="status-dot" data-state={voiceUi} /> {status}
          </p>
        </div>
      </div>

      <div className="side-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "progress"}
          className={tab === "progress" ? "active" : ""}
          onClick={() => setTab("progress")}
        >
          Progress
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "transcript"}
          className={tab === "transcript" ? "active" : ""}
          onClick={() => setTab("transcript")}
        >
          Transcript
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "notes"}
          className={tab === "notes" ? "active" : ""}
          onClick={() => setTab("notes")}
        >
          Notes
        </button>
      </div>

      {tab === "progress" && (
        <ol className="progress-list">
          {plan.steps.map((step, i) => {
            const done = runtime.completedStepIds.includes(step.id);
            const current = i === runtime.currentStepIndex && !done;
            return (
              <li
                key={step.id}
                className={done ? "done" : current ? "current" : ""}
              >
                <span className="step-mark">
                  {done ? "✓" : current ? "●" : "○"}
                </span>
                <span>
                  <strong>{step.title}</strong>
                  {current && <em>{step.strategy}</em>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {tab === "transcript" && (
        <div className="transcript-panel">
          {transcript.length === 0 ? (
            <p className="side-empty">
              Live captions appear here as you and Mentora speak.
            </p>
          ) : (
            <ul>
              {transcript.map((line) => (
                <li key={line.id} data-role={line.role}>
                  <strong>
                    {line.role === "mentora"
                      ? "Mentora"
                      : line.role === "you"
                        ? "You"
                        : "System"}
                  </strong>
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "notes" && (
        <div className="notes-panel">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jot lesson notes… saved for this session."
            rows={12}
          />
        </div>
      )}

      <div className="gauge-block">
        <p className="gauge-label">Understanding</p>
        <div className="gauge-row">
          <span className="gauge-pct">{understandingPct}%</span>
          <div style={{ flex: 1 }}>
            <div className="gauge-meter" aria-hidden>
              <i style={{ width: `${understandingPct}%` }} />
            </div>
            <p className="encourage">{encourage}</p>
          </div>
        </div>
      </div>

      <div className="session-stats">
        <span>Lesson time: {elapsed}</span>
        <span>Questions asked: {runtime.questionsAsked}</span>
      </div>
    </aside>
  );
}

function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
