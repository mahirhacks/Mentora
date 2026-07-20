import type { MicStatus } from "../hooks/useVoiceInput";

interface VoiceMicButtonProps {
  isMuted: boolean;
  micStatus: MicStatus;
  micError?: string | null;
  disabled?: boolean;
  onToggle: () => void;
}

function statusLabel(micStatus: MicStatus, isMuted: boolean) {
  if (isMuted) {
    return "Mic muted";
  }

  switch (micStatus) {
    case "recording":
      return "Recording...";
    case "transcribing":
      return "Transcribing...";
    case "listening":
      return "Listening";
    default:
      return "Mic on";
  }
}

export function VoiceMicButton({
  isMuted,
  micStatus,
  micError,
  disabled = false,
  onToggle,
}: VoiceMicButtonProps) {
  const active = !isMuted;
  const busy = micStatus === "transcribing" || disabled;

  return (
    <div className="voice-mic-control">
      <button
        type="button"
        className={[
          "voice-mic-button",
          active ? "is-active" : "",
          micStatus === "recording" ? "is-recording" : "",
          busy ? "is-busy" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => void onToggle()}
        disabled={busy}
        aria-pressed={active}
        aria-label={statusLabel(micStatus, isMuted)}
        title={micError ?? statusLabel(micStatus, isMuted)}
      >
        {isMuted ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
            <path d="M17 11a5 5 0 0 1-10 0" />
            <path d="M12 18v3" />
            <path d="M8 21h8" />
            <path d="m3 3 18 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
            <path d="M17 11a5 5 0 0 1-10 0" />
            <path d="M12 18v3" />
            <path d="M8 21h8" />
          </svg>
        )}
      </button>
      <span className="voice-mic-status">
        {micError ? "Mic blocked" : statusLabel(micStatus, isMuted)}
      </span>
    </div>
  );
}
