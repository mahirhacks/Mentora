import { useEffect, useState } from "react";
import { useLessonUiStore } from "../../state/lessonUiStore";
import { usePrefsStore } from "../../state/prefsStore";
import { useSessionStore } from "../../state/sessionStore";

/** Hold captions on screen briefly after Mentora stops speaking. */
const CAPTION_HOLD_MS = 2800;

/**
 * YouTube-style live captions for Mentora speech only (above the ask prompt).
 */
export function LiveCaptionOverlay() {
  const enabled = usePrefsStore((s) => s.captionsEnabled);
  const voiceUi = useSessionStore((s) => s.voiceUi);
  const transcript = useLessonUiStore((s) => s.transcript);
  const [visible, setVisible] = useState(false);

  const caption = [...transcript]
    .reverse()
    .find((line) => line.role === "mentora" && line.text.trim())?.text;

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    if (voiceUi === "speaking" && caption) {
      setVisible(true);
      return;
    }
    if (voiceUi === "speaking") return;
    const timer = setTimeout(() => setVisible(false), CAPTION_HOLD_MS);
    return () => clearTimeout(timer);
  }, [enabled, voiceUi, caption]);

  if (!enabled || !visible || !caption?.trim()) return null;

  return (
    <div className="live-caption" aria-live="polite">
      <p>{caption.trim()}</p>
    </div>
  );
}
