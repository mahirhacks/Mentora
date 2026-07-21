import { useState } from "react";
import { BoardCanvas } from "../components/BoardCanvas";
import { CaptionBar } from "../components/CaptionBar";
import { ChatBar } from "../components/ChatBar";
import { ToolWheeler } from "../components/ToolWheeler";
import { TranscriptionPanel } from "../components/TranscriptionPanel";
import { useTeachingSession } from "../hooks/useTeachingSession";
import type { UserBoardTool } from "../types";

interface LessonPageProps {
  mountId: string;
  sessionId?: string | null;
  initialPrompt?: string | null;
  onBack: () => void;
  onSessionReady?: (sessionId: string, mountId: string) => void;
}

export function LessonPage({
  mountId,
  sessionId = null,
  initialPrompt = null,
  onBack,
  onSessionReady,
}: LessonPageProps) {
  const [userBoardTool, setUserBoardTool] =
    useState<UserBoardTool>("pointer");
  const {
    boardState,
    canvasColor,
    setCanvasColor,
    transcript,
    notes,
    setNotes,
    summarizeConversationNotes,
    prompt,
    setPrompt,
    isBusy,
    isPlanning,
    isSpeaking,
    isLoadingSession,
    turnPhase,
    canRetry,
    activeToolName,
    caption,
    submitPrompt,
    retryLastTurn,
    stopCurrentTurn,
    reset,
    isMuted,
    micStatus,
    pushToTalk,
    toggleMute,
    getVoiceMetrics,
    applyUserBoardAction,
    canEditBoard,
    interruptForBoardInput,
  } = useTeachingSession({
    initialSessionId: sessionId,
    autoStartPrompt: initialPrompt,
    mountId,
    onSessionReady,
  });

  return (
    <div className="app-shell lesson-app-shell">
      <section className="lesson-workspace">
        <div className="board-area">
          <BoardCanvas
            boardState={boardState}
            activeToolName={activeToolName}
            userTool={userBoardTool}
            disabled={!canEditBoard}
            canvasColor={canvasColor}
            onCanvasColorChange={setCanvasColor}
            onInteractionStart={interruptForBoardInput}
            onUserAction={applyUserBoardAction}
          />
          <ToolWheeler
            selectedTool={userBoardTool}
            disabled={!canEditBoard}
            onSelectTool={setUserBoardTool}
          />
          <CaptionBar text={caption} isSpeaking={isSpeaking} />
        </div>
        <div className="chat-area">
          <div className="lesson-chat-row">
            <button
              className="home-link icon-button"
              type="button"
              onClick={onBack}
              aria-label="All lessons"
              title="All lessons"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 18 9 12l6-6" />
              </svg>
            </button>
            {isLoadingSession ? (
              <span className="lesson-loading-label">Loading...</span>
            ) : null}
            <div className="lesson-chat-main">
              <ChatBar
                value={prompt}
                onChange={setPrompt}
                onSubmit={() => void submitPrompt()}
                disabled={isBusy}
                isMuted={isMuted}
                micStatus={micStatus}
                pushToTalk={pushToTalk}
                onToggleMic={() => void toggleMute()}
                onReset={() => void reset()}
                onRetry={() => void retryLastTurn()}
                canRetry={canRetry}
                onStop={stopCurrentTurn}
                isBusy={isBusy}
              />
            </div>
          </div>
        </div>
      </section>

      <TranscriptionPanel
        entries={transcript}
        isPlanning={isPlanning}
        turnPhase={turnPhase}
        getVoiceMetrics={getVoiceMetrics}
        notes={notes}
        onNotesChange={setNotes}
        onSummarizeConversation={() => summarizeConversationNotes()}
      />
    </div>
  );
}
