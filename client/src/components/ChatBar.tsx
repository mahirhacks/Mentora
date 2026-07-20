interface ChatBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function ChatBar({
  value,
  onChange,
  onSubmit,
  disabled = false,
}: ChatBarProps) {
  return (
    <form
      className="chat-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
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
