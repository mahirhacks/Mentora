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
  summarizeSessionConversation,
  syncSessionCanvasBackground,
  syncSessionNotes,
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
  BOARD_CANVAS_COLORS,
  type BoardCanvasColor,
} from "../components/BoardSettingsButton";
import {
  initialTurnState,
  isTurnActive,
  turnReducer,
} from "./turnState";

const emptyBoard = (): BoardState => ({
  objects: {},
  revision: 0,
  backgroundColor: "#f7f7f8",
});

function asBoardCanvasColor(value: string | undefined): BoardCanvasColor {
  const match = BOARD_CANVAS_COLORS.find((color) => color.value === value);
  return match?.value ?? "#f7f7f8";
}
const CANVAS_SETTLE_MS = 2_300;
const VOICE_SETTLE_MS = 350;
const COMBINED_SETTLE_MS = 350;

function isMeaningfulUtterance(text: string) {
  const cleaned = text.trim();
  if (cleaned.length < 2) {
    return false;
  }

  // Require at least one real word (letters) or a numeric answer like "24".
  // Reject pure noise / punctuation-only transcriptions.
  return /[A-Za-z]{2,}|\d+/.test(cleaned);
}

function appendSummaryToNotes(
  notes: string,
  topic: string,
  summary: string,
) {
  const block = `${topic}\n${summary}`;
  const trimmed = notes.replace(/\s+$/, "");
  if (!trimmed) {
    return `${block}\n`;
  }
  return `${trimmed}\n\n${block}\n`;
}

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
  const [canvasColor, setCanvasColorState] =
    useState<BoardCanvasColor>("#f7f7f8");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [notes, setNotesState] = useState("");
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [isLoadingSession, setIsLoadingSession] = useState(true);
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
  const canvasColorRef = useRef<BoardCanvasColor>(canvasColor);
  const notesSaveTimerRef = useRef<number | null>(null);
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

  useEffect(() => {
    canvasColorRef.current = canvasColor;
  }, [canvasColor]);

  const setNotes = useCallback((next: string) => {
    setNotesState(next);
    const id = sessionIdRef.current;
    if (!id) {
      return;
    }
    if (notesSaveTimerRef.current !== null) {
      window.clearTimeout(notesSaveTimerRef.current);
    }
    notesSaveTimerRef.current = window.setTimeout(() => {
      notesSaveTimerRef.current = null;
      void syncSessionNotes(id, next).catch(() => {
        // Persistence failures should not interrupt note-taking.
      });
    }, 450);
  }, []);

  const setCanvasColor = useCallback((next: BoardCanvasColor) => {
    canvasColorRef.current = next;
    setCanvasColorState(next);
    setBoardState((current) => ({
      ...current,
      backgroundColor: next,
    }));
    const id = sessionIdRef.current;
    if (!id) {
      return;
    }
    void syncSessionCanvasBackground(id, next).catch(() => {
      // Persistence failures should not interrupt canvas settings.
    });
  }, []);

  const applyRemoteBoardState = useCallback((next: BoardState) => {
    setBoardState({
      ...next,
      backgroundColor:
        next.backgroundColor ?? canvasColorRef.current ?? "#f7f7f8",
    });
  }, []);

  const summarizeConversationNotes = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) {
      throw new Error("Start a lesson before summarizing.");
    }
    const result = await summarizeSessionConversation(
      id,
      transcriptRef.current,
    );
    setNotesState((current) => {
      const next = appendSummaryToNotes(current, result.topic, result.summary);
      void syncSessionNotes(id, next).catch(() => {
        // Persistence failures should not interrupt note-taking.
      });
      return next;
    });
  }, []);

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
          applyRemoteBoardState(event.boardState);
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
          applyRemoteBoardState(event.boardState);
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
    [applyRemoteBoardState, handleBargeIn, persistTranscript, playVoiceAudio],
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
              sessionIdRef.current = id;
              setSessionId(id);
              onSessionReady?.(id);
              void syncSessionCanvasBackground(
                id,
                canvasColorRef.current,
              ).catch(() => undefined);
            },
          },
        );
        if (nextSessionId && activeTurnIdRef.current === turnId) {
          sessionIdRef.current = nextSessionId;
          setSessionId(nextSessionId);
          onSessionReady?.(nextSessionId);
          void syncSessionCanvasBackground(
            nextSessionId,
            canvasColorRef.current,
          ).catch(() => undefined);
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
          applyRemoteBoardState({
            ...created.boardState,
            backgroundColor: canvasColorRef.current,
          });
          void syncSessionCanvasBackground(id, canvasColorRef.current).catch(
            () => undefined,
          );
          onSessionReady?.(id);
        }
        const nextState = await applyUserBoardActionApi(id, action);
        applyRemoteBoardState(nextState);
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
      applyRemoteBoardState,
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
        // Transcribe first. Only interrupt Mentora when we have real words —
        // empty / noise transcripts must not kill thinking or voice.
        const text = await transcribeAudio(blob);
        const cleaned = text.trim();
        if (!isMeaningfulUtterance(cleaned)) {
          return;
        }

        cancelActiveTurn();
        pendingVoiceTextRef.current = cleaned;
        dispatchTurn({ type: "ready" });
        schedulePendingInput(
          pendingCanvasRef.current
            ? COMBINED_SETTLE_MS
            : VOICE_SETTLE_MS,
        );
      } catch {
        // Transcription failures should not interrupt an active turn.
      }
    },
    [cancelActiveTurn, schedulePendingInput],
  );

  const {
    isMuted,
    micStatus,
    micError,
    pushToTalk,
    toggleMute,
    stopListening,
  } = useVoiceInput({
    disabled: isLoadingSession,
    assistantSpeaking: isSpeaking,
    onUtterance: handleVoiceUtterance,
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
    setNotesState("");
    setCaption("");
    dispatchTurn({ type: "ready" });
  }, [persistTranscript, sessionId, stopCurrentTurn, stopListening]);

  useEffect(() => {
    let cancelled = false;
    const bootSessionId = initialSessionId;
    const bootPrompt = autoStartPrompt?.trim() || undefined;

    async function bootSession() {
      setIsLoadingSession(true);
      try {
        if (bootSessionId) {
          // Resume one existing lesson — its planner memory stays isolated.
          const snapshot = await fetchLearningSession(bootSessionId);
          if (cancelled) {
            return;
          }
          sessionIdRef.current = snapshot.id;
          setSessionId(snapshot.id);
          setBoardState(snapshot.boardState);
          setCanvasColorState(
            asBoardCanvasColor(snapshot.boardState.backgroundColor),
          );
          setNotesState(snapshot.notes ?? "");
          setTranscript(
            (snapshot.transcript ?? []).filter(
              (entry): entry is TranscriptEntry =>
                entry.kind === "student" || entry.kind === "speak",
            ),
          );
          onSessionReady?.(snapshot.id);
          return;
        }

        // New lesson: allocate a fresh server session before any turn so
        // planner messages/board/transcript cannot bleed from another lesson.
        const created = await createLearningSession(bootPrompt);
        if (cancelled) {
          return;
        }
        sessionIdRef.current = created.id;
        setSessionId(created.id);
        setBoardState({
          ...created.boardState,
          backgroundColor: canvasColorRef.current,
        });
        setNotesState("");
        setTranscript([]);
        setCaption("");
        dispatchTurn({ type: "ready" });
        void syncSessionCanvasBackground(
          created.id,
          canvasColorRef.current,
        ).catch(() => undefined);
        onSessionReady?.(created.id);
      } catch {
        if (!cancelled && bootSessionId) {
          sessionIdRef.current = bootSessionId;
          setSessionId(bootSessionId);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSession(false);
        }
      }
    }

    void bootSession();
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
      if (notesSaveTimerRef.current !== null) {
        window.clearTimeout(notesSaveTimerRef.current);
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
    canvasColor,
    setCanvasColor,
    transcript,
    notes,
    setNotes,
    summarizeConversationNotes,
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
    pushToTalk,
    toggleMute,
    getVoiceMetrics,
    applyUserBoardAction,
    canEditBoard: !isLoadingSession,
    interruptForBoardInput: handleBargeIn,
  };
}
