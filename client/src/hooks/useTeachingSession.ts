import { useCallback, useEffect, useRef, useState } from "react";
import { resetLesson } from "../api/teachApi";
import { streamStudentTurn, transcribeAudio } from "../api/voiceApi";
import { useVoiceInput } from "./useVoiceInput";
import { VoicePlaybackQueue } from "../voice/VoicePlaybackQueue";
import type {
  BoardState,
  LessonEvent,
  TranscriptEntry,
} from "../types";

const emptyBoard = (): BoardState => ({ objects: {}, revision: 0 });

export function useTeachingSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [boardState, setBoardState] = useState<BoardState>(emptyBoard);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playbackRef = useRef(new VoicePlaybackQueue());

  const handleBargeIn = useCallback(() => {
    playbackRef.current.cancel();
    setIsSpeaking(false);
  }, []);

  const playVoiceAudio = useCallback((audioBase64: string, mimeType: string) => {
    setIsSpeaking(true);
    void playbackRef.current
      .enqueue(audioBase64, mimeType)
      .finally(() => {
        setIsSpeaking(false);
      });
  }, []);

  const handleEvent = useCallback(
    (event: LessonEvent) => {
      switch (event.type) {
        case "planning":
          setIsPlanning(true);
          break;
        case "step": {
          const step = event.step;
          if (step.kind === "speak") {
            setTranscript((current) => [
              ...current,
              {
                id: `speak-${event.index}`,
                kind: "speak",
                text: step.text ?? step.directive.voiceScript,
                speechId: step.directive.speechId,
              },
            ]);
          } else if (step.kind === "observe") {
            setTranscript((current) => [
              ...current,
              {
                id: `observe-${event.index}`,
                kind: "observe",
                text: step.text,
              },
            ]);
          } else {
            setActiveToolName(step.toolName);
          }
          break;
        }
        case "tool_result":
          setBoardState(event.boardState);
          setActiveToolName(null);
          break;
        case "observe_context":
          setTranscript((current) =>
            current.map((entry) =>
              entry.id === `observe-${event.index}`
                ? { ...entry, context: event.context }
                : entry,
            ),
          );
          break;
        case "speech_interpreted":
          setTranscript((current) =>
            current.map((entry) =>
              entry.id === `speak-${event.index}`
                ? {
                    ...entry,
                    text: event.naturalText,
                    speechId: event.speechId,
                  }
                : entry,
            ),
          );
          break;
        case "voice_audio":
          playVoiceAudio(event.audioBase64, event.mimeType);
          break;
        case "done":
          setBoardState(event.boardState);
          setIsPlanning(false);
          setActiveToolName(null);
          break;
        case "error":
          setError(event.message);
          setIsPlanning(false);
          setActiveToolName(null);
          handleBargeIn();
          break;
      }
    },
    [handleBargeIn, playVoiceAudio],
  );

  const runStudentTurn = useCallback(
    async (text: string, source: "voice" | "chat") => {
      handleBargeIn();
      setIsBusy(true);
      setError(null);

      setTranscript((current) => [
        ...current,
        {
          id: `student-${Date.now()}`,
          kind: "student",
          text,
          source,
        },
      ]);

      try {
        const nextSessionId = await streamStudentTurn(
          text,
          source,
          sessionId,
          handleEvent,
          { enableVoice: true },
        );
        if (nextSessionId) {
          setSessionId(nextSessionId);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setIsPlanning(false);
        setActiveToolName(null);
      } finally {
        setIsBusy(false);
      }
    },
    [handleBargeIn, handleEvent, sessionId],
  );

  const submitPrompt = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isBusy) {
      return;
    }

    setPrompt("");
    await runStudentTurn(trimmed, "chat");
  }, [isBusy, prompt, runStudentTurn]);

  const handleVoiceUtterance = useCallback(
    async (blob: Blob) => {
      if (isBusy) {
        return;
      }

      try {
        const text = await transcribeAudio(blob);
        await runStudentTurn(text, "voice");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [isBusy, runStudentTurn],
  );

  const {
    isMuted,
    micStatus,
    micError,
    toggleMute,
    stopListening,
  } = useVoiceInput({
    disabled: isBusy,
    onUtterance: handleVoiceUtterance,
    onBargeIn: handleBargeIn,
  });

  const reset = useCallback(async () => {
    handleBargeIn();
    stopListening();
    if (sessionId) {
      await resetLesson(sessionId);
    }
    setBoardState(emptyBoard());
    setTranscript([]);
    setError(null);
    setActiveToolName(null);
    setIsPlanning(false);
  }, [handleBargeIn, sessionId, stopListening]);

  useEffect(() => {
    return () => {
      playbackRef.current.cancel();
    };
  }, []);

  return {
    sessionId,
    boardState,
    transcript,
    prompt,
    setPrompt,
    isBusy,
    isPlanning,
    isSpeaking,
    activeToolName,
    error,
    submitPrompt,
    reset,
    isMuted,
    micStatus,
    micError,
    toggleMute,
  };
}
