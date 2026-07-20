interface CaptionBarProps {
  text: string;
  isSpeaking: boolean;
}

export function CaptionBar({
  text,
  isSpeaking,
}: CaptionBarProps) {
  if (!text) {
    return null;
  }

  return (
    <div
      className={[
        "caption-bar",
        isSpeaking ? "is-speaking" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="caption-speaker">Mentora</span>
      <p>{text}</p>
    </div>
  );
}
