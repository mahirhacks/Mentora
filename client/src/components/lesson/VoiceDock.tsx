import { useSessionStore } from "../../state/sessionStore";
import { useState } from "react";

type Props = {
  onAsk?: (text: string) => void;
  onMute?: () => void;
};

export function VoiceDock({ onAsk, onMute }: Props) {
  const voiceUi = useSessionStore((s) => s.voiceUi);
  const muted = useSessionStore((s) => s.muted);
  const connection = useSessionStore((s) => s.connection);
  const [text, setText] = useState("");

  const label =
    connection === "idle"
      ? "Type a topic or start a lesson"
      : voiceUi === "listening"
        ? "Listening… Speak anytime to answer or interrupt."
        : voiceUi === "speaking"
          ? "Mentora is speaking…"
          : voiceUi === "thinking"
            ? "Mentora is thinking…"
            : voiceUi === "waiting"
              ? "What do you think?"
              : "Ready";

  const submit = () => {
    const q = text.trim();
    if (!q || !onAsk) return;
    onAsk(q);
    setText("");
  };

  return (
    <div className="voice-dock" data-state={voiceUi}>
      <form
        className="ask-box"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="sparkle">✦</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask anything… What would you like to learn?"
          aria-label="Ask Mentora anything"
        />
      </form>

      <div className="dock-center">
        <div className="wave fancy">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p>
          <i className="status-dot" data-state={voiceUi} /> {label}
        </p>
      </div>

      <div className="dock-actions">
        <button
          type="button"
          className={`mic-btn ${muted ? "muted" : ""}`}
          title={muted ? "Unmute microphone" : "Mute microphone"}
          onClick={onMute}
          disabled={!onMute}
        >
          {muted ? "🔇" : "🎤"}
        </button>
        <button
          type="button"
          className="send-btn"
          title="Send"
          disabled={!text.trim()}
          onClick={submit}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
