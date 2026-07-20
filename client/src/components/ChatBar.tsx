import { VoiceMicButton } from "./VoiceMicButton";
import type { MicStatus } from "../hooks/useVoiceInput";

interface ChatBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isMuted: boolean;
  micStatus: MicStatus;
  micError?: string | null;
  onToggleMic: () => void;
}

export function ChatBar({
  value,
  onChange,
  onSubmit,
  disabled = false,
  isMuted,
  micStatus,
  micError,
  onToggleMic,
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
        micError={micError}
        disabled={disabled}
        onToggle={onToggleMic}
      />
      <input
        className="chat-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask Mentora to teach you anything..."
        disabled={disabled}
      />
      <button className="chat-submit" type="submit" disabled={disabled || !value.trim()}>
        Teach me
      </button>
    </form>
  );
}
