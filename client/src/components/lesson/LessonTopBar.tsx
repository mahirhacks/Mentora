import { Link } from "react-router-dom";
import { useSessionStore } from "../../state/sessionStore";
import { useTeachingStore } from "../../state/teachingStore";

type Props = {
  busy: boolean;
  onStart: () => void;
  onStopAi: () => void;
  onMute: () => void;
  onRestart: () => void;
  onStopLesson: () => void;
  onExit: () => void;
};

export function LessonTopBar({
  busy,
  onStart,
  onStopAi,
  onMute,
  onRestart,
  onStopLesson,
  onExit,
}: Props) {
  const connection = useSessionStore((s) => s.connection);
  const voiceUi = useSessionStore((s) => s.voiceUi);
  const muted = useSessionStore((s) => s.muted);
  const plan = useTeachingStore((s) => s.plan);
  const live = connection === "connected" || connection === "connecting";

  const pill =
    connection === "connected"
      ? "Live lesson"
      : connection === "connecting"
        ? "Connecting…"
        : connection === "error"
          ? "Connection error"
          : "Ready";

  return (
    <header className="lesson-topbar">
      <div className="topbar-left">
        <Link to="/" className="top-brand" onClick={onExit}>
          <span className="brand-mark">✦</span>
          <strong>Mentora</strong>
        </Link>
        <button
          type="button"
          className="icon-btn"
          title="Exit lesson"
          onClick={onExit}
        >
          ✕
        </button>
      </div>

      <div className="topbar-center">
        <span className="live-pill" data-live={live ? "yes" : "no"}>
          <i /> {pill}
        </span>
        <h1>{plan.title || "Live lesson"}</h1>
        <span className="voice-chip compact" data-state={voiceUi}>
          {voiceUi}
        </span>
      </div>

      <div className="topbar-right">
        {!live ? (
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={onStart}
          >
            Start lesson
          </button>
        ) : (
          <>
            <button type="button" className="btn ghost" onClick={onStopAi}>
              Stop AI
            </button>
            <button type="button" className="btn ghost" onClick={onMute}>
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={onRestart}
            >
              Restart
            </button>
            <button type="button" className="btn danger" onClick={onStopLesson}>
              ■ Stop lesson
            </button>
          </>
        )}
      </div>
    </header>
  );
}
