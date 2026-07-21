import { useEffect, useRef, useState } from "react";
import type { TranscriptEntry } from "../types";
import type { TurnPhase } from "../hooks/turnState";
import type { VoiceMetrics } from "../voice/VoicePlaybackQueue";
import { VoiceOrb } from "./VoiceOrb";

type SidePanelTab = "transcription" | "notes";

interface TranscriptionPanelProps {
  entries: TranscriptEntry[];
  isPlanning: boolean;
  turnPhase: TurnPhase;
  getVoiceMetrics?: () => VoiceMetrics;
  notes: string;
  onNotesChange: (notes: string) => void;
  onSummarizeConversation: () => Promise<void>;
}

export function TranscriptionPanel({
  entries,
  isPlanning,
  turnPhase,
  getVoiceMetrics,
  notes,
  onNotesChange,
  onSummarizeConversation,
}: TranscriptionPanelProps) {
  const [tab, setTab] = useState<SidePanelTab>("transcription");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const previousCountRef = useRef(0);

  const canSummarize =
    entries.some(
      (entry) =>
        (entry.kind === "student" || entry.kind === "speak") &&
        entry.text.trim().length > 0,
    ) && !isSummarizing;

  useEffect(() => {
    if (tab !== "transcription") {
      return;
    }

    const feed = feedRef.current;
    if (!feed) {
      return;
    }

    const previousCount = previousCountRef.current;
    previousCountRef.current = entries.length;

    if (entries.length === 0) {
      return;
    }

    if (entries.length <= previousCount && previousCount !== 0) {
      return;
    }

    feed.scrollTo({
      top: feed.scrollHeight,
      behavior: previousCount === 0 ? "auto" : "smooth",
    });
  }, [entries, tab]);

  const handleSummarize = async () => {
    if (!canSummarize) {
      return;
    }
    setSummarizeError(null);
    setIsSummarizing(true);
    try {
      await onSummarizeConversation();
    } catch (error) {
      setSummarizeError(
        error instanceof Error
          ? error.message
          : "Failed to summarize conversation",
      );
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <aside className="transcription-panel">
      <header className="transcription-header">
        <VoiceOrb phase={turnPhase} getVoiceMetrics={getVoiceMetrics} />
      </header>

      <div className="side-panel-body">
        <div className="side-panel-overlay">
          <div className="side-panel-fade" aria-hidden="true" />
          <div className="side-panel-tabs" role="tablist" aria-label="Side panel">
            <button
              type="button"
              role="tab"
              className={`side-panel-tab${tab === "transcription" ? " is-active" : ""}`}
              aria-selected={tab === "transcription"}
              onClick={() => setTab("transcription")}
            >
              Transcription
            </button>
            <button
              type="button"
              role="tab"
              className={`side-panel-tab${tab === "notes" ? " is-active" : ""}`}
              aria-selected={tab === "notes"}
              onClick={() => setTab("notes")}
            >
              Notes
            </button>
          </div>
        </div>

        {tab === "transcription" ? (
          <div className="transcription-feed" ref={feedRef} role="tabpanel">
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
        ) : (
          <div className="notes-panel" role="tabpanel">
            <textarea
              className="notes-editor"
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Write your notes for this lesson..."
              aria-label="Lesson notes"
            />
            <div className="notes-footer">
              {summarizeError ? (
                <p className="notes-summarize-error">{summarizeError}</p>
              ) : null}
              <button
                type="button"
                className="notes-summarize-button"
                onClick={() => void handleSummarize()}
                disabled={!canSummarize}
              >
                {isSummarizing ? "Summarizing..." : "Summarize Conversation"}
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
