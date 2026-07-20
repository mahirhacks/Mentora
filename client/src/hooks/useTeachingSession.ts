import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { resetLesson } from "../api/teachApi";
import {
  applyUserBoardAction as applyUserBoardActionApi,
  createLearningSession,
  fetchLearningSession,
  syncSessionTranscript,
} from "../api/sessionsApi";
import { streamStudentTurn, transcribeAudio } from "../api/voiceApi";
import { useVoiceInput } from "./useVoiceInput";
import { VoicePlaybackQueue } from "../voice/VoicePlaybackQueue";
import type {
  BoardState,
  LessonEvent,
  TranscriptEntry,
  UserBoardAction,
} from "../types";
import {
  initialTurnState,
  isTurnActive,
  turnReducer,
} from "./turnState";

const emptyBoard = (): BoardState => ({ objects: {}, revision: 0 });
const CANVAS_SETTLE_MS = 2_300;
const VOICE_SETTLE_MS = 350;
const COMBINED_SETTLE_MS = 350;

interface RunTurnOptions {
  transcriptText?: string;
  addToTranscript?: boolean;
}

type RunStudentTurn = (
  text: string,
  source: "voice" | "chat",
  options?: RunTurnOptions,
) => Promise<void>;

export interface UseTeachingSessionOptions {
  initialSessionId?: string | null;
  autoStartPrompt?: string | null;
  onSessionReady?: (sessionId: string) => void;
}

export function useTeachingSession(
  options: UseTeachingSessionOptions = {},
) {
  const {
    initialSessionId = null,
    autoStartPrompt = null,
    onSessionReady,
  } = options;

  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [boardState, setBoardState] = useState<BoardState>(emptyBoard);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [isLoadingSession, setIsLoadingSession] = useState(
    Boolean(initialSessionId),
  );
  const [turnState, dispatchTurn] = useReducer(
    turnReducer,
    initialTurnState,
  );
  const isBusy = isTurnActive(turnState.phase);
  const isPlanning = turnState.phase === "planning";
  const isSpeaking = turnState.phase === "speaking";
  const activeToolName = turnState.activeToolName;
  const error = turnState.error;

  const playbackRef = useRef(new VoicePlaybackQueue());
  const activeTurnIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastTurnRef = useRef<{
    text: string;
    source: "voice" | "chat";
  } | null>(null);
  const autoStartHandledRef = useRef(false);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const sessionIdRef = useRef<string | null>(sessionId);
  const boardActionPendingRef = useRef(false);
  const pendingCanvasRef = useRef(false);
  const pendingVoiceTextRef = useRef<string | null>(null);
  const pendingInputTimerRef = useRef<number | null>(null);
  const runStudentTurnRef = useRef<RunStudentTurn>(async () => {});

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const clearPendingInputTimer = useCallback(() => {
    if (pendingInputTimerRef.current !== null) {
      window.clearTimeout(pendingInputTimerRef.current);
      pendingInputTimerRef.current = null;
    }
  }, []);

  const cancelActiveTurn = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeTurnIdRef.current = null;
    playbackRef.current.cancel();
    setCaption("");
    dispatchTurn({ type: "ready" });
  }, []);

  const stopCurrentTurn = useCallback(() => {
    clearPendingInputTimer();
    pendingCanvasRef.current = false;
    pendingVoiceTextRef.current = null;
    cancelActiveTurn();
  }, [cancelActiveTurn, clearPendingInputTimer]);

  const flushPendingInput = useCallback(() => {
    pendingInputTimerRef.current = null;
    const voiceText = pendingVoiceTextRef.current?.trim() ?? "";
    const hasCanvasEdits = pendingCanvasRef.current;
    pendingVoiceTextRef.current = null;
    pendingCanvasRef.current = false;

    if (!voiceText && !hasCanvasEdits) {
      return;
    }

    if (voiceText) {
      const plannerText = hasCanvasEdits
        ? `${voiceText}\n\n[The student also edited the canvas. Inspect recentUserActions and the current user-created objects before responding.]`
        : voiceText;
      void runStudentTurnRef.current(plannerText, "voice", {
        transcriptText: voiceText,
        addToTranscript: true,
      });
      return;
    }

    void runStudentTurnRef.current(
      "Please look at what I just changed on the canvas. Inspect recentUserActions and the current user-created objects, then respond to my work.",
      "chat",
      { addToTranscript: false },
    );
  }, []);

  const schedulePendingInput = useCallback(
    (delayMs: number) => {
      clearPendingInputTimer();
      pendingInputTimerRef.current = window.setTimeout(
        flushPendingInput,
        delayMs,
      );
    },
    [clearPendingInputTimer, flushPendingInput],
  );

  const handleBargeIn = useCallback(() => {
    // Preserve already collected voice/canvas input, but stop any pending
    // auto-submit while the student is still interacting.
    clearPendingInputTimer();
    cancelActiveTurn();
  }, [cancelActiveTurn, clearPendingInputTimer]);

  const persistTranscript = useCallback(async (id: string) => {
    try {
      await syncSessionTranscript(id, transcriptRef.current);
    } catch {
      // Persistence failures should not interrupt the lesson.
    }
  }, []);

  const playVoiceAudio = useCallback(
    async (audioBase64: string, mimeType: string) => {
      dispatchTurn({ type: "speaking" });
      try {
        await playbackRef.current.enqueue(audioBase64, mimeType);
      } finally {
        // The following stream event selects the next phase.
      }
    },
    [],
  );

  const handleEvent = useCallback(
    async (event: LessonEvent) => {
      switch (event.type) {
        case "planning":
          setCaption("");
          dispatchTurn({ type: "planning" });
          break;
        case "step": {
          const step = event.step;
          if (step.kind === "tool") {
            dispatchTurn({
              type: "drawing",
              toolName: step.toolName,
            });
          }
          break;
        }
        case "tool_result":
          setBoardState(event.boardState);
          dispatchTurn({ type: "tool_complete" });
          break;
        case "observe_context":
          break;
        case "speech_interpreted":
          dispatchTurn({ type: "speaking" });
          if (event.transcriptSource === "voice_model") {
            setCaption(event.naturalText);
            setTranscript((current) => [
              ...current,
              {
                id: `voice-${event.speechId}-${Date.now()}`,
                kind: "speak",
                text: event.naturalText,
                speechId: event.speechId,
              },
            ]);
          }
          break;
        case "voice_audio":
          await playVoiceAudio(event.audioBase64, event.mimeType);
          break;
        case "done":
          setBoardState(event.boardState);
          dispatchTurn({ type: "ready" });
          if (sessionIdRef.current) {
            window.setTimeout(() => {
              if (sessionIdRef.current) {
                void persistTranscript(sessionIdRef.current);
              }
            }, 50);
          }
          break;
        case "error":
          dispatchTurn({
            type: "error",
            message: event.message,
            recoverable: event.recoverable,
          });
          handleBargeIn();
          break;
      }
    },
    [handleBargeIn, persistTranscript, playVoiceAudio],
  );

  const runStudentTurn = useCallback(
    async (
      text: string,
      source: "voice" | "chat",
      runOptions: RunTurnOptions = {},
    ) => {
      cancelActiveTurn();
      const turnId = crypto.randomUUID();
      const controller = new AbortController();
      activeTurnIdRef.current = turnId;
      abortRef.current = controller;
      lastTurnRef.current = { text, source };
      dispatchTurn({ type: "planning" });

      if (runOptions.addToTranscript !== false) {
        setTranscript((current) => [
          ...current,
          {
            id: `student-${Date.now()}`,
            kind: "student",
            text: runOptions.transcriptText ?? text,
            source,
          },
        ]);
      }

      try {
        const nextSessionId = await streamStudentTurn(
          text,
          source,
          sessionIdRef.current,
          handleEvent,
          {
            enableVoice: true,
            turnId,
            signal: controller.signal,
            onSession: (id) => {
              setSessionId(id);
              onSessionReady?.(id);
            },
          },
        );
        if (nextSessionId && activeTurnIdRef.current === turnId) {
          setSessionId(nextSessionId);
          onSessionReady?.(nextSessionId);
          // Let React flush transcript before syncing.
          window.setTimeout(() => {
            void persistTranscript(nextSessionId);
          }, 0);
        }
      } catch (caught) {
        if (
          !(caught instanceof DOMException && caught.name === "AbortError") &&
          activeTurnIdRef.current === turnId
        ) {
          dispatchTurn({
            type: "error",
            message: caught instanceof Error ? caught.message : String(caught),
            recoverable: true,
          });
        }
      } finally {
        if (activeTurnIdRef.current === turnId) {
          activeTurnIdRef.current = null;
          abortRef.current = null;
        }
      }
    },
    [
      handleEvent,
      onSessionReady,
      persistTranscript,
      cancelActiveTurn,
    ],
  );

  useEffect(() => {
    runStudentTurnRef.current = runStudentTurn;
  }, [runStudentTurn]);

  const submitPrompt = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isBusy) {
      return;
    }

    clearPendingInputTimer();
    const hasCanvasEdits = pendingCanvasRef.current;
    pendingCanvasRef.current = false;
    pendingVoiceTextRef.current = null;
    setPrompt("");
    await runStudentTurn(
      hasCanvasEdits
        ? `${trimmed}\n\n[The student also edited the canvas. Inspect recentUserActions and the current user-created objects before responding.]`
        : trimmed,
      "chat",
      { transcriptText: trimmed },
    );
  }, [
    clearPendingInputTimer,
    isBusy,
    prompt,
    runStudentTurn,
  ]);

  const applyUserBoardAction = useCallback(
    async (action: UserBoardAction) => {
      if (isLoadingSession || boardActionPendingRef.current) {
        throw new Error("Wait for the current board update to finish.");
      }
      cancelActiveTurn();
      boardActionPendingRef.current = true;
      try {
        let id = sessionIdRef.current;
        if (!id) {
          const created = await createLearningSession();
          id = created.id;
          sessionIdRef.current = id;
          setSessionId(id);
          setBoardState(created.boardState);
          onSessionReady?.(id);
        }
        const nextState = await applyUserBoardActionApi(id, action);
        setBoardState(nextState);
        pendingCanvasRef.current = true;
        schedulePendingInput(
          pendingVoiceTextRef.current
            ? COMBINED_SETTLE_MS
            : CANVAS_SETTLE_MS,
        );
        return nextState;
      } finally {
        boardActionPendingRef.current = false;
      }
    },
    [
      cancelActiveTurn,
      isLoadingSession,
      onSessionReady,
      schedulePendingInput,
    ],
  );

  const startLesson = useCallback(
    async (text: string) => {
      if (isBusy || !text.trim()) {
        return;
      }
      setPrompt("");
      await runStudentTurn(text.trim(), "chat");
    },
    [isBusy, runStudentTurn],
  );

  const retryLastTurn = useCallback(async () => {
    const lastTurn = lastTurnRef.current;
    if (!lastTurn || isBusy) {
      return;
    }
    await runStudentTurn(lastTurn.text, lastTurn.source);
  }, [isBusy, runStudentTurn]);

  const handleVoiceUtterance = useCallback(
    async (blob: Blob) => {
      try {
        cancelActiveTurn();
        dispatchTurn({ type: "transcribing" });
        const text = await transcribeAudio(blob);
        if (!text.trim()) {
          dispatchTurn({ type: "ready" });
          return;
        }
        pendingVoiceTextRef.current = text.trim();
        dispatchTurn({ type: "ready" });
        schedulePendingInput(
          pendingCanvasRef.current
            ? COMBINED_SETTLE_MS
            : VOICE_SETTLE_MS,
        );
      } catch {
        dispatchTurn({ type: "ready" });
      }
    },
    [cancelActiveTurn, schedulePendingInput],
  );

  const {
    isMuted,
    micStatus,
    micError,
    toggleMute,
    stopListening,
  } = useVoiceInput({
    disabled: isLoadingSession,
    assistantSpeaking: isSpeaking,
    onUtterance: handleVoiceUtterance,
    onBargeIn: handleBargeIn,
  });

  const reset = useCallback(async () => {
    stopCurrentTurn();
    stopListening();
    if (sessionId) {
      await resetLesson(sessionId);
      await persistTranscript(sessionId);
    }
    setBoardState(emptyBoard());
    setTranscript([]);
    setCaption("");
    dispatchTurn({ type: "ready" });
  }, [persistTranscript, sessionId, stopCurrentTurn, stopListening]);

  useEffect(() => {
    let cancelled = false;
    const bootSessionId = initialSessionId;

    async function loadSession() {
      if (!bootSessionId) {
        setIsLoadingSession(false);
        return;
      }

      setIsLoadingSession(true);
      try {
        const snapshot = await fetchLearningSession(bootSessionId);
        if (cancelled) {
          return;
        }
        setSessionId(snapshot.id);
        setBoardState(snapshot.boardState);
        setTranscript(
          (snapshot.transcript ?? []).filter(
            (entry): entry is TranscriptEntry =>
              entry.kind === "student" || entry.kind === "speak",
          ),
        );
        onSessionReady?.(snapshot.id);
      } catch {
        if (!cancelled) {
          setSessionId(bootSessionId);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSession(false);
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
    // Boot once for this lesson mount; parent sessionId updates must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      autoStartHandledRef.current ||
      isLoadingSession ||
      !autoStartPrompt?.trim()
    ) {
      return;
    }
    autoStartHandledRef.current = true;
    void runStudentTurn(autoStartPrompt.trim(), "chat");
  }, [autoStartPrompt, isLoadingSession, runStudentTurn]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      playbackRef.current.cancel();
      if (pendingInputTimerRef.current !== null) {
        window.clearTimeout(pendingInputTimerRef.current);
      }
    };
  }, []);

  const getVoiceMetrics = useCallback(
    () => playbackRef.current.getVoiceMetrics(),
    [],
  );

  return {
    sessionId,
    boardState,
    transcript,
    prompt,
    setPrompt,
    isBusy: isBusy || isLoadingSession,
    isPlanning,
    isSpeaking,
    isLoadingSession,
    turnPhase: turnState.phase,
    canRetry: turnState.recoverable,
    activeToolName,
    error,
    caption,
    stopCurrentTurn,
    submitPrompt,
    startLesson,
    retryLastTurn,
    reset,
    isMuted,
    micStatus,
    micError,
    toggleMute,
    getVoiceMetrics,
    applyUserBoardAction,
    canEditBoard: !isLoadingSession,
    interruptForBoardInput: handleBargeIn,
  };
}
