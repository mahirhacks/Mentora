import { VoiceMicButton } from "./VoiceMicButton";
import type { MicStatus } from "../hooks/useVoiceInput";

interface ChatBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isMuted: boolean;
  micStatus: MicStatus;
  onToggleMic: () => void;
  onReset: () => void;
  onRetry?: () => void;
  canRetry?: boolean;
  onStop?: () => void;
  isBusy?: boolean;
}

export function ChatBar({
  value,
  onChange,
  onSubmit,
  disabled = false,
  isMuted,
  micStatus,
  onToggleMic,
  onReset,
  onRetry,
  canRetry = false,
  onStop,
  isBusy = false,
}: ChatBarProps) {
  return (
    <form
      className="chat-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <VoiceMicButton
        isMuted={isMuted}
        micStatus={micStatus}
        disabled={disabled}
        onToggle={onToggleMic}
      />
      <input
        className="chat-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask for a foundational concept using boxes, labels, or equations..."
        disabled={disabled}
        aria-label="Lesson prompt"
      />
      <div className="chat-actions">
        {isBusy && onStop ? (
          <button
            className="icon-button stop-icon"
            type="button"
            onClick={onStop}
            aria-label="Stop"
            title="Stop"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="1.5" />
            </svg>
          </button>
        ) : null}
        {canRetry && onRetry ? (
          <button
            className="icon-button retry-icon"
            type="button"
            onClick={onRetry}
            disabled={isBusy}
            aria-label="Retry"
            title="Retry"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
          </button>
        ) : null}
        <button
          className="icon-button reset-icon"
          type="button"
          onClick={onReset}
          disabled={isBusy}
          aria-label="Reset board"
          title="Reset board"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 15.5-6.4" />
            <path d="M21 3v6h-6" />
            <path d="M21 12a9 9 0 0 1-15.5 6.4" />
            <path d="M3 21v-6h6" />
          </svg>
        </button>
        <button
          className="icon-button submit-icon"
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Send"
          title="Send"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
      </div>
    </form>
  );
}
