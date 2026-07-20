import { useCallback, useState } from "react";
import { resetLesson, streamLesson } from "../api/teachApi";
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
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleEvent = useCallback((event: LessonEvent) => {
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
              text: step.text,
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
      case "done":
        setBoardState(event.boardState);
        setIsPlanning(false);
        setActiveToolName(null);
        break;
      case "error":
        setError(event.message);
        setIsPlanning(false);
        setActiveToolName(null);
        break;
    }
  }, []);

  const submitPrompt = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isBusy) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setPrompt("");

    try {
      const nextSessionId = await streamLesson(
        trimmed,
        sessionId,
        handleEvent,
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
  }, [handleEvent, isBusy, prompt, sessionId]);

  const reset = useCallback(async () => {
    if (sessionId) {
      await resetLesson(sessionId);
    }
    setBoardState(emptyBoard());
    setTranscript([]);
    setError(null);
    setActiveToolName(null);
    setIsPlanning(false);
  }, [sessionId]);

  return {
    sessionId,
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
  };
}
