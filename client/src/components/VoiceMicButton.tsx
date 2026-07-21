import type { MicStatus } from "../hooks/useVoiceInput";

interface VoiceMicButtonProps {
  isMuted: boolean;
  micStatus: MicStatus;
  disabled?: boolean;
  pushToTalk?: boolean;
  onToggle: () => void;
}

function statusLabel(
  micStatus: MicStatus,
  isMuted: boolean,
  pushToTalk: boolean,
) {
  if (pushToTalk) {
    return "Push to talk — click to interrupt";
  }

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
  disabled = false,
  pushToTalk = false,
  onToggle,
}: VoiceMicButtonProps) {
  const active = !isMuted;
  // Stay clickable during assistant speech so push-to-talk can interrupt.
  const busy = micStatus === "transcribing" || (disabled && !pushToTalk);

  return (
    <button
      type="button"
      className={[
        "voice-mic-button",
        active ? "is-active" : "",
        micStatus === "recording" ? "is-recording" : "",
        pushToTalk ? "is-push-to-talk" : "",
        busy ? "is-busy" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => void onToggle()}
      disabled={busy}
      aria-pressed={active}
      aria-label={statusLabel(micStatus, isMuted, pushToTalk)}
      title={statusLabel(micStatus, isMuted, pushToTalk)}
    >
      {isMuted && !pushToTalk ? (
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
  );
}
