import { useEffect, useRef, useState } from "react";
import type { TurnPhase } from "../hooks/turnState";
import type { VoiceMetrics } from "../voice/VoicePlaybackQueue";

export type VoiceOrbMode = "idle" | "thinking" | "speaking" | "failed";

interface VoiceOrbProps {
  phase: TurnPhase;
  getVoiceMetrics?: () => VoiceMetrics;
}

export function voiceOrbMode(phase: TurnPhase): VoiceOrbMode {
  if (phase === "recoverable_error") {
    return "failed";
  }
  if (phase === "speaking") {
    return "speaking";
  }
  if (
    phase === "planning" ||
    phase === "drawing" ||
    phase === "transcribing"
  ) {
    return "thinking";
  }
  return "idle";
}

function modeLabel(mode: VoiceOrbMode) {
  switch (mode) {
    case "thinking":
      return "Thinking";
    case "speaking":
      return "Speaking";
    case "failed":
      return "Needs retry";
    default:
      return "Ready";
  }
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

export function VoiceOrb({ phase, getVoiceMetrics }: VoiceOrbProps) {
  const mode = voiceOrbMode(phase);
  const [metrics, setMetrics] = useState<VoiceMetrics>({
    amplitude: 0,
    pitch: 0.35,
  });
  const smoothedRef = useRef<VoiceMetrics>({ amplitude: 0, pitch: 0.35 });

  useEffect(() => {
    if (mode !== "speaking" || !getVoiceMetrics) {
      smoothedRef.current = { amplitude: 0, pitch: 0.35 };
      setMetrics({ amplitude: 0, pitch: 0.35 });
      return;
    }

    let frameId = 0;
    const tick = () => {
      const next = getVoiceMetrics();
      const smoothed = smoothedRef.current;
      smoothed.amplitude = lerp(smoothed.amplitude, next.amplitude, 0.38);
      smoothed.pitch = lerp(smoothed.pitch, next.pitch, 0.22);
      setMetrics({ ...smoothed });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [mode, getVoiceMetrics]);

  const speaking = mode === "speaking";
  const scale = speaking
    ? 1 + metrics.amplitude * 0.22 + metrics.pitch * 0.06
    : undefined;
  const glowScale = speaking
    ? 1 + metrics.amplitude * 0.35 + metrics.pitch * 0.18
    : undefined;
  const glowOpacity = speaking
    ? 0.55 + metrics.amplitude * 0.45 + metrics.pitch * 0.15
    : undefined;

  return (
    <div className="voice-orb-section" aria-live="polite">
      <div
        className={`voice-orb mode-${mode}${speaking && getVoiceMetrics ? " is-live" : ""}`}
        role="img"
        aria-label={`Mentora is ${modeLabel(mode).toLowerCase()}`}
        style={
          speaking && scale !== undefined
            ? { transform: `scale(${scale.toFixed(3)})` }
            : undefined
        }
      >
        <span className="voice-orb-core" />
        <span
          className="voice-orb-glow"
          style={
            speaking && glowScale !== undefined && glowOpacity !== undefined
              ? {
                  transform: `scale(${glowScale.toFixed(3)})`,
                  opacity: Math.min(1, glowOpacity),
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
