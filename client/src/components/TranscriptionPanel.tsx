import type { TranscriptEntry } from "../types";
import type { TurnPhase } from "../hooks/turnState";
import type { VoiceMetrics } from "../voice/VoicePlaybackQueue";
import { VoiceOrb } from "./VoiceOrb";

interface TranscriptionPanelProps {
  entries: TranscriptEntry[];
  isPlanning: boolean;
  turnPhase: TurnPhase;
  getVoiceMetrics?: () => VoiceMetrics;
}

export function TranscriptionPanel({
  entries,
  isPlanning,
  turnPhase,
  getVoiceMetrics,
}: TranscriptionPanelProps) {
  return (
    <aside className="transcription-panel">
      <header className="transcription-header">
        <VoiceOrb phase={turnPhase} getVoiceMetrics={getVoiceMetrics} />
      </header>

      <div className="transcription-feed">
        {entries.length === 0 && !isPlanning ? (
          <p className="transcription-empty">
            Type a question or unmute the mic and speak. Mentora and your
            messages will appear here.
          </p>
        ) : null}

        {entries.map((entry) => {
          if (entry.kind === "observe") {
            return null;
          }

          if (entry.kind === "student") {
            return (
              <div key={entry.id} className="transcription-item student">
                <span className="transcription-label">You</span>
                <p>{entry.text}</p>
              </div>
            );
          }

          return (
            <div key={entry.id} className="transcription-item speak">
              <span className="transcription-label">Mentora</span>
              <p>{entry.text}</p>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
