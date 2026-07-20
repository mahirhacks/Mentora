import type { TranscriptEntry } from "../types";

interface TranscriptionPanelProps {
  entries: TranscriptEntry[];
  isPlanning: boolean;
}

export function TranscriptionPanel({
  entries,
  isPlanning,
}: TranscriptionPanelProps) {
  return (
    <aside className="transcription-panel">
      <header className="transcription-header">
        <p className="eyebrow">Live transcription</p>
        <h2>Lesson transcript</h2>
      </header>

      <div className="transcription-feed">
        {entries.length === 0 && !isPlanning ? (
          <p className="transcription-empty">
            Type a question or unmute the mic and speak. Mentora and your
            messages will appear here.
          </p>
        ) : null}

        {isPlanning ? (
          <div className="transcription-item planning">Planning lesson...</div>
        ) : null}

        {entries.map((entry) => {
          if (entry.kind === "student") {
            return (
              <div key={entry.id} className="transcription-item student">
                <span className="transcription-label">
                  You {entry.source === "voice" ? "(voice)" : ""}
                </span>
                <p>{entry.text}</p>
              </div>
            );
          }

          if (entry.kind === "speak") {
            return (
              <div key={entry.id} className="transcription-item speak">
                <span className="transcription-label">Mentora</span>
                <p>{entry.text}</p>
              </div>
            );
          }

          return (
            <div key={entry.id} className="transcription-item observe">
              <span className="transcription-label">Observing board</span>
              <p>{entry.text}</p>
              {entry.context ? (
                <pre className="observe-context">{entry.context}</pre>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
