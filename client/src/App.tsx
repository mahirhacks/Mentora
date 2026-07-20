import { BoardCanvas } from "./components/BoardCanvas";
import { ChatBar } from "./components/ChatBar";
import { TranscriptionPanel } from "./components/TranscriptionPanel";
import { useTeachingSession } from "./hooks/useTeachingSession";

export function App() {
  const {
    boardState,
    transcript,
    prompt,
    setPrompt,
    isBusy,
    isPlanning,
    activeToolName,
    error,
    submitPrompt,
    reset,
  } = useTeachingSession();

  return (
    <div className="app-shell">
      <section className="lesson-workspace">
        <div className="board-area">
          <BoardCanvas
            boardState={boardState}
            activeToolName={activeToolName}
          />
        </div>
        <div className="chat-area">
          <div className="chat-toolbar">
            <div>
              <p className="eyebrow">Mentora lesson</p>
              <h1>Interactive teaching board</h1>
            </div>
            <button
              className="reset-button"
              type="button"
              onClick={() => void reset()}
              disabled={isBusy}
            >
              Reset board
            </button>
          </div>
          {error ? <p className="error-banner">{error}</p> : null}
          <ChatBar
            value={prompt}
            onChange={setPrompt}
            onSubmit={() => void submitPrompt()}
            disabled={isBusy}
          />
        </div>
      </section>

      <TranscriptionPanel entries={transcript} isPlanning={isPlanning} />
    </div>
  );
}
