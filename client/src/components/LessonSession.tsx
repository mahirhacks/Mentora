import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isSquareFormulaTopic, normalizeTopic } from "@mentora/shared";
import type { StudentBoardNotify } from "../board/BoardCanvas";
import { fetchRealtimeToken } from "../api/realtimeApi";
import { createLessonPlan } from "../api/lessonApi";
import { RealtimeClient } from "../realtime/RealtimeClient";
import { EventRouter, toolsForSession } from "../realtime/EventRouter";
import {
  MENTORA_INSTRUCTIONS,
  buildLessonOpeningVoiceInstructions,
} from "../realtime/instructions";
import { TurnGate, getActiveTurnGate, setActiveTurnGate, VAD_BASE, INPUT_AUDIO_TRANSCRIPTION } from "../realtime/turnGate";
import { isScrapTranscript } from "../realtime/conversationManager";
import { useSessionStore } from "../state/sessionStore";
import { useTeachingStore } from "../state/teachingStore";
import { useBoardStore } from "../state/boardStore";
import { useLessonUiStore } from "../state/lessonUiStore";
import {
  HINTS_TO_DELAY_MS,
  SPEED_TO_NUMBER,
  playUiBeep,
  usePrefsStore,
} from "../state/prefsStore";
import { useBoard } from "../board/BoardContext";
import { BoardCanvas } from "../board/BoardCanvas";
import { squareFormulaBoardActions } from "../board/squareDemo";
import { liveBoardSnapshot } from "../board/liveBoardSnapshot";
import { SilenceWatchdog } from "../teaching/silenceWatchdog";
import { LessonTopBar } from "./lesson/LessonTopBar";
import { BoardToolRail } from "./lesson/BoardToolRail";
import { MentoraSidebar } from "./lesson/MentoraSidebar";
import { VoiceDock } from "./lesson/VoiceDock";
import { LiveCaptionOverlay } from "./lesson/LiveCaptionOverlay";
import { publishVoiceUi } from "../realtime/voiceActivity";

const REALTIME_MODEL =
  import.meta.env.VITE_OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini";
const DEMO_SAFE = import.meta.env.VITE_DEMO_SAFE_MODE === "true";

/** Greetings / filler — never promote these to the lesson topic. */
function isChitchatNotTopic(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[!?.…]+$/g, "")
    .trim();
  if (!t) return true;
  if (t.length <= 2) return true;
  return /^(hi+|hii+|hello|hey+|yo|sup|hiya|howdy|thanks|thank you|thx|ok|okay|k|yes|yep|no|nope|bye|good morning|good evening)$/i.test(
    t,
  );
}

const seenTranscriptDone = new Set<string>();
/** Prefer GA transcript events; ignore legacy aliases once GA is seen (avoids double lines). */
let mentoraTranscriptApi: "ga" | "legacy" | null = null;

function ingestTranscriptEvent(event: Record<string, unknown>) {
  const type = String(event.type ?? "");
  const ui = useLessonUiStore.getState();
  const itemId = String(event.item_id ?? event.event_id ?? "");
  const gate = getActiveTurnGate();

  const isGaDelta = type === "response.output_audio_transcript.delta";
  const isLegacyDelta = type === "response.audio_transcript.delta";
  const isGaDone = type === "response.output_audio_transcript.done";
  const isLegacyDone = type === "response.audio_transcript.done";

  if (isGaDelta || isLegacyDelta) {
    if (gate?.shouldSuppressMentoraTranscript()) return;
    const family = isGaDelta ? "ga" : "legacy";
    if (mentoraTranscriptApi && mentoraTranscriptApi !== family) return;
    mentoraTranscriptApi = family;
    const delta = String(event.delta ?? "");
    if (delta) ui.appendOrUpdateStreaming("mentora", delta, "append");
    const responseId = String(event.response_id ?? "");
    if (delta && responseId) {
      gate?.onMentoraTranscriptDelta(delta, responseId);
    }
    return;
  }

  if (isGaDone || isLegacyDone) {
    if (gate?.shouldSuppressMentoraTranscript()) return;
    const family = isGaDone ? "ga" : "legacy";
    if (mentoraTranscriptApi && mentoraTranscriptApi !== family) return;
    mentoraTranscriptApi = family;
    const full = String(event.transcript ?? "").trim();
    const key = itemId ? `mentora:${itemId}` : `mentora:${full}`;
    if (seenTranscriptDone.has(key)) return;
    seenTranscriptDone.add(key);
    if (seenTranscriptDone.size > 100) {
      const first = seenTranscriptDone.values().next().value;
      if (first) seenTranscriptDone.delete(first);
    }
    ui.finalizeStreaming("mentora", full);
    gate?.onMentoraTranscript(full);
    return;
  }

  // YOU lines: only show after we know it's a real student turn (not echo).
  if (type === "conversation.item.input_audio_transcription.delta") {
    if (
      gate?.conversation.mentoraSpeaking ||
      gate?.conversation.isMentoraRecentlyInterrupted()
    ) {
      return;
    }
    if (gate?.shouldHideYouItem(itemId)) return;
    const cumulative = event.transcript != null ? String(event.transcript) : "";
    const delta = String(event.delta ?? "");
    const preview = (cumulative || delta).trim();
    if (preview && isScrapTranscript(preview)) return;
    if (cumulative) {
      ui.appendOrUpdateStreaming("you", cumulative, "replace");
    } else if (delta) {
      ui.appendOrUpdateStreaming("you", delta, "append");
    }
    return;
  }

  if (type === "conversation.item.input_audio_transcription.completed") {
    if (gate?.shouldHideYouItem(itemId)) return;
    const full = String(event.transcript ?? "").trim();
    const kind = gate?.conversation.classify(full) ?? "student";
    if (kind !== "student") return;
    const key = itemId ? `you:${itemId}` : `you:${full}`;
    if (seenTranscriptDone.has(key)) return;
    seenTranscriptDone.add(key);
    ui.finalizeStreaming("you", full);
  }
}

export function LessonSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { queue } = useBoard();
  const clientRef = useRef<RealtimeClient | null>(null);
  const routerRef = useRef<EventRouter | null>(null);
  const gateRef = useRef<TurnGate | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const watchdogRef = useRef<SilenceWatchdog | null>(null);
  const autoStarted = useRef<string | null>(null);
  /** Bumps on each start/stop so a raced async connect can't keep writing transcripts. */
  const sessionGenRef = useRef(0);
  /** Chat typed while connecting — send once the session is live. */
  const pendingChatRef = useRef<string | null>(null);
  /** Prevents overlapping startLesson calls. */
  const startingRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const setConnection = useSessionStore((s) => s.setConnection);
  const setVoiceUi = useSessionStore((s) => s.setVoiceUi);
  const setMuted = useSessionStore((s) => s.setMuted);
  const setError = useSessionStore((s) => s.setError);
  const muted = useSessionStore((s) => s.muted);
  const error = useSessionStore((s) => s.error);
  const connection = useSessionStore((s) => s.connection);

  const runtime = useTeachingStore((s) => s.runtime);
  const topicRequest = useTeachingStore((s) => s.topicRequest);
  const setTopicRequest = useTeachingStore((s) => s.setTopicRequest);
  const patchRuntime = useTeachingStore((s) => s.patchRuntime);
  const setPlan = useTeachingStore((s) => s.setPlan);
  const resetTeaching = useTeachingStore((s) => s.resetTeaching);
  const clearStudentStrokes = useBoardStore((s) => s.clearStudentStrokes);
  const clearStudentPlaced = useBoardStore((s) => s.clearStudentPlaced);
  const clearLessonUi = useLessonUiStore((s) => s.clearLessonUi);

  const resolveTopic = () => {
    const fromUrl = searchParams.get("topic")?.trim();
    if (fromUrl) {
      const topic = normalizeTopic(fromUrl);
      setTopicRequest(topic, `Teach me: ${fromUrl}`);
      return topic;
    }
    const fromStore = topicRequest.trim();
    if (fromStore) return normalizeTopic(fromStore);
    return "Expanding (a+b)^2";
  };

  useEffect(() => {
    // No vocal silence nudges — they caused Mentora to keep talking while "waiting".
    watchdogRef.current = new SilenceWatchdog(
      {
        isWaiting: () =>
          useTeachingStore.getState().runtime.phase === "waiting_for_student",
        isSuspended: () =>
          useTeachingStore.getState().runtime.studentBoardActive ||
          useBoardStore.getState().studentBoardActive,
        onFirstNudge: () => undefined,
        onSecondNudge: () => undefined,
      },
      HINTS_TO_DELAY_MS[usePrefsStore.getState().hintsLevel],
    );
    return () => {
      watchdogRef.current?.clear();
      sessionGenRef.current += 1;
      startingRef.current = false;
      autoStarted.current = null;
      void clientRef.current?.disconnect();
      clientRef.current = null;
      routerRef.current = null;
      gateRef.current = null;
      setActiveTurnGate(null);
      // Zustand connection survives remount — clear so auto-start isn't blocked.
      useSessionStore.getState().setConnection("idle");
      useSessionStore.getState().setVoiceUi("idle");
    };
  }, []);

  useEffect(() => {
    if (runtime.phase === "waiting_for_student") {
      // Do NOT session.update here — that cuts live audio mid-sentence.
      watchdogRef.current?.clear();
    }
  }, [runtime.phase, connection]);

  useEffect(() => {
    if (runtime.phase === "complete") {
      playUiBeep("done");
      navigate("/summary");
    }
  }, [runtime.phase, navigate]);

  const injectStudentBoardUpdate = (payload: StudentBoardNotify) => {
    const client = clientRef.current;
    const gate = gateRef.current;
    if (!client || !gate) return;

    // Defense: only student ink / student-placed objects count as answers.
    const studentIds = new Set([
      ...useBoardStore.getState().studentStrokes.map((s) => s.id),
      ...useBoardStore.getState().studentPlacedIds,
    ]);
    const claimed = payload.update.strokeIds ?? [];
    const hasStudentContent = claimed.some((id) => studentIds.has(id));
    if (!hasStudentContent) {
      console.info(
        "[mentora:board] ignore board update — no student-authored content",
      );
      return;
    }

    if (useTeachingStore.getState().runtime.phase === "waiting_for_student") {
      patchRuntime({ phase: "evaluating", wasInterrupted: true });
    }
    const { text } = liveBoardSnapshot(queue.getRegistry());
    const content: Array<Record<string, unknown>> = [
      {
        type: "input_text",
        text: `student_board_update: ${JSON.stringify(payload.update)}

${payload.imageNote ?? ""}

CURRENT PIXEL BOARD MAP:
${text}

AUTHorship rules:
- Only STUDENT ink (dashed red) and objects marked [student] are the student's answer.
- Objects marked [ai] are Mentora's own drawings — do NOT treat them as student input.
- Respond to what the student just drew/placed, not to Mentora's prior board work.`,
      },
    ];
    if (payload.imageDataUrl) {
      content.push({
        type: "input_image",
        image_url: payload.imageDataUrl,
      });
    }
    client.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content,
      },
    });
    const answerSummary = `student_board_update: ${JSON.stringify(payload.update)}`;
    gate.requestReplyAfterInjectedStudentInput(answerSummary);
  };

  const onStudentDrawStart = () => {
    try {
      clientRef.current?.stopResponse();
    } catch {
      // ignore
    }
  };

  const sendStudentChat = (q: string, client: RealtimeClient) => {
    const gate = gateRef.current;
    useLessonUiStore.getState().appendTranscript({
      role: "you",
      text: q,
    });
    // Real student chat stays in history; decide path does not inject fake decision messages.
    client.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: q }],
      },
    });
    if (gate) {
      gate.requestReplyAfterInjectedStudentInput(q);
    }
  };

  const startLesson = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setBusy(true);
    setError(null);
    setConnection("connecting");
    const sessionGen = ++sessionGenRef.current;
    const stillThisSession = () => sessionGenRef.current === sessionGen;
    await clientRef.current?.disconnect();
    if (!stillThisSession()) {
      startingRef.current = false;
      return;
    }
    clientRef.current = null;
    routerRef.current = null;
    gateRef.current = null;
    setActiveTurnGate(null);
    const topic = resolveTopic();
    resetTeaching(topic);
    clearStudentStrokes();
    clearStudentPlaced();
    clearLessonUi();
    seenTranscriptDone.clear();
    mentoraTranscriptApi = null;
    setTopicRequest(topic, `Teach me: ${topic}`);
    const request =
      useTeachingStore.getState().studentRequest ||
      `Teach me ${topic} on the whiteboard`;
    const prefs = usePrefsStore.getState();
    try {
      const planned = await createLessonPlan({
        topic,
        studentRequest: request,
        demoSafeMode: DEMO_SAFE,
      });
      if (!stillThisSession()) return;
      setPlan(planned.plan, planned.source);
      patchRuntime({
        phase: "teaching",
        planTitle: planned.plan.title,
        startedAt: Date.now(),
      });

      // Keep watchdog silent — no vocal nudges while waiting.
      watchdogRef.current?.clear();
      watchdogRef.current = new SilenceWatchdog(
        {
          isWaiting: () =>
            useTeachingStore.getState().runtime.phase === "waiting_for_student",
          isSuspended: () =>
            useTeachingStore.getState().runtime.studentBoardActive ||
            useBoardStore.getState().studentBoardActive,
          onFirstNudge: () => undefined,
          onSecondNudge: () => undefined,
        },
        HINTS_TO_DELAY_MS[prefs.hintsLevel],
      );

      const token = await fetchRealtimeToken();
      if (!stillThisSession()) return;
      const client = new RealtimeClient({
        onState: (state) => {
          if (!stillThisSession()) return;
          setConnection(state);
        },
        onVoiceUi: (ui) => {
          if (!stillThisSession()) return;
          setVoiceUi(ui);
          if (ui === "waiting") playUiBeep("ready");
        },
        onError: (message) => {
          if (!stillThisSession()) return;
          setError(message);
        },
        onRemoteStream: (stream) => {
          if (!stillThisSession()) return;
          if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.autoplay = true;
          }
          audioRef.current.srcObject = stream;
          void audioRef.current.play().catch(() => undefined);
        },
        onEvent: (event) => {
          if (!stillThisSession()) return;
          // Classify / delete echo before UI ingest so YOU never flashes for echo.
          if (
            event.type === "conversation.item.input_audio_transcription.completed" ||
            event.type === "conversation.item.deleted"
          ) {
            void routerRef.current?.onEvent(event).then(() => {
              if (!stillThisSession()) return;
              ingestTranscriptEvent(event);
            });
            return;
          }
          ingestTranscriptEvent(event);
          if (event.type === "input_audio_buffer.speech_started") {
            watchdogRef.current?.clear();
          }
          void routerRef.current?.onEvent(event).then(() => {
            if (!stillThisSession()) return;
            if (
              event.type === "response.done" ||
              event.type === "response.cancelled"
            ) {
              publishVoiceUi();
              const gate = gateRef.current;
              if (
                useTeachingStore.getState().runtime.phase ===
                "waiting_for_student"
              ) {
                gate?.lock();
              }
            }
          });
        },
      });
      if (!stillThisSession()) {
        await client.disconnect();
        return;
      }
      clientRef.current = client;
      const gate = new TurnGate(client, { getQueue: () => queue });
      gateRef.current = gate;
      routerRef.current = new EventRouter(client, queue, gate);

      await client.connect(token.value, REALTIME_MODEL);
      if (!stillThisSession()) {
        await client.disconnect();
        return;
      }
      client.updateSession({
        type: "realtime",
        instructions: `${MENTORA_INSTRUCTIONS}\n\nHint style preference: ${prefs.hintsLevel}.`,
        tools: toolsForSession(),
        tool_choice: "none",
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: INPUT_AUDIO_TRANSCRIPTION,
            turn_detection: { ...VAD_BASE },
          },
          output: {
            voice: prefs.voice,
            speed: SPEED_TO_NUMBER[prefs.speechSpeed],
          },
        },
      });
      await client.waitForSessionUpdated();
      if (!stillThisSession()) {
        await client.disconnect();
        return;
      }

      const firstStep = planned.plan.steps[0];
      const seedActions =
        firstStep?.boardPlan && firstStep.boardPlan.length > 0
          ? firstStep.boardPlan
          : isSquareFormulaTopic(topic)
            ? squareFormulaBoardActions()
            : [
                {
                  type: "write_text" as const,
                  objectId: "topic_title",
                  x: 80,
                  y: 70,
                  text: planned.plan.title.slice(0, 60),
                  fontSize: 30,
                  fill: "#164e3b",
                },
              ];

      const drawn = await queue.applyActions({
        actions: [{ type: "clear_board" }, ...seedActions],
      });
      if (!stillThisSession()) {
        await client.disconnect();
        return;
      }
      console.info("[mentora:board:seed]", drawn);
      patchRuntime({
        boardObjectIds: queue.getRegistry().listIds(),
        boardVersion: useTeachingStore.getState().runtime.boardVersion + 1,
      });
      useLessonUiStore.getState().appendTranscript({
        role: "system",
        text: `Lesson started: ${planned.plan.title}`,
      });

      const openingBeatId = crypto.randomUUID();
      gate.beginVoiceTurn({
        kind: "lesson_opening",
        turnId: gate.getTurnId(),
        beatId: openingBeatId,
        instructions: buildLessonOpeningVoiceInstructions(topic),
      });
      const pending = pendingChatRef.current?.trim();
      if (pending) {
        pendingChatRef.current = null;
        const startedAt = Date.now();
        const flushPending = () => {
          if (!stillThisSession()) return;
          const live = clientRef.current;
          if (!live) return;
          const phase = useTeachingStore.getState().runtime.phase;
          const ready =
            phase === "waiting_for_student" || Date.now() - startedAt > 20000;
          if (!ready) {
            window.setTimeout(flushPending, 500);
            return;
          }
          sendStudentChat(pending, live);
        };
        window.setTimeout(flushPending, 2500);
      }
      playUiBeep("ready");
    } catch (err) {
      if (!stillThisSession()) return;
      setConnection("error");
      setError(err instanceof Error ? err.message : String(err));
      // Allow auto-start / Retry after a failure.
      autoStarted.current = null;
    } finally {
      startingRef.current = false;
      if (stillThisSession()) setBusy(false);
    }
  };

  // Auto-start whenever we have a topic and no live client.
  // Do NOT gate on connection==="connecting" — that state can get stuck after a remount.
  useEffect(() => {
    const topic = searchParams.get("topic")?.trim();
    if (!topic) return;
    if (clientRef.current) return;
    if (startingRef.current) return;
    if (connection === "error" && autoStarted.current === topic) return;
    if (autoStarted.current === topic && connection === "connected") return;
    autoStarted.current = topic;
    setTopicRequest(topic, `Teach me: ${topic}`);
    void startLesson();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // If we were left stranded on "connecting" with no client (aborted start), recover.
  useEffect(() => {
    if (connection !== "connecting") return;
    if (clientRef.current || startingRef.current) return;
    const topic = searchParams.get("topic")?.trim();
    const timer = window.setTimeout(() => {
      if (clientRef.current || startingRef.current) return;
      if (useSessionStore.getState().connection !== "connecting") return;
      console.warn("[mentora] recovering stuck connecting state");
      useSessionStore.getState().setConnection("idle");
      autoStarted.current = null;
      if (topic) {
        autoStarted.current = topic;
        void startLesson();
      }
    }, 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, searchParams]);

  const stopAi = () => {
    clientRef.current?.stopResponse();
    queue.interruptDropPending();
  };

  const toggleMute = () => {
    const next = !muted;
    clientRef.current?.setMuted(next);
    setMuted(next);
    playUiBeep("click");
  };

  const stopLesson = async () => {
    sessionGenRef.current += 1;
    await clientRef.current?.disconnect();
    clientRef.current = null;
    routerRef.current = null;
    patchRuntime({ phase: "complete", completedAt: Date.now() });
  };

  const exitLesson = async () => {
    sessionGenRef.current += 1;
    await clientRef.current?.disconnect();
    clientRef.current = null;
    routerRef.current = null;
    setConnection("idle");
    navigate("/");
  };

  const restart = async () => {
    autoStarted.current = null;
    await clientRef.current?.disconnect();
    clientRef.current = null;
    routerRef.current = null;
    setMuted(false);
    await startLesson();
  };

  const undoBoard = () => {
    const store = useBoardStore.getState();
    if (store.studentStrokes.length > 0) {
      store.undoLastStroke();
      playUiBeep("click");
      return;
    }
    const objectId = store.popStudentPlaced();
    if (objectId) {
      void queue.applyActions({
        actions: [{ type: "erase_object", objectId }],
      });
      playUiBeep("click");
    }
  };

  const empty = useBoardStore((s) => s.objects.length === 0);

  return (
    <section className="live-lesson-stage">
      <LessonTopBar
        busy={busy}
        onStart={() => void startLesson()}
        onStopAi={stopAi}
        onMute={toggleMute}
        onRestart={() => void restart()}
        onStopLesson={() => void stopLesson()}
        onExit={() => void exitLesson()}
      />

      <div className="live-workspace">
        <BoardToolRail
          onUndo={undoBoard}
          onResetInk={() => clearStudentStrokes()}
          onReplay={() => {
            const plan = useTeachingStore.getState().plan;
            const step = plan.steps[0];
            const topic = useTeachingStore.getState().topicRequest;
            clearStudentPlaced();
            const seed =
              step?.boardPlan && step.boardPlan.length > 0
                ? step.boardPlan
                : isSquareFormulaTopic(topic)
                  ? squareFormulaBoardActions()
                  : [
                      {
                        type: "write_text" as const,
                        objectId: "topic_title",
                        x: 80,
                        y: 70,
                        text: (plan.title || topic).slice(0, 60),
                        fontSize: 30,
                        fill: "#164e3b",
                      },
                    ];
            void queue.applyActions({
              actions: [{ type: "clear_board" }, ...seed],
            });
          }}
        />

        <div className="board-column">
          <div
            className={`board-frame ${
              empty && (connection === "idle" || connection === "connecting")
                ? "empty"
                : ""
            }`}
          >
            {empty && connection === "connecting" && (
              <div className="board-empty">
                <p>Getting the board ready</p>
                <span>
                  Mentora is starting — she&apos;ll welcome you and ask the first
                  question.
                </span>
              </div>
            )}
            {empty && connection === "idle" && (
              <div className="board-empty">
                <p>Your shared whiteboard</p>
                <span>Choose a topic on Home and Mentora will start teaching.</span>
                {error && <p className="err">{error}</p>}
              </div>
            )}
            {empty && connection === "error" && (
              <div className="board-empty">
                <p>Couldn&apos;t start the lesson</p>
                <span>Hit Retry lesson above, or pick another topic on Home.</span>
                {error && <p className="err">{error}</p>}
              </div>
            )}
            <BoardCanvas
              autoPlaySquareDemo={false}
              hideToolbar
              onStudentBoardUpdate={injectStudentBoardUpdate}
              onStudentDrawStart={onStudentDrawStart}
            />
          </div>
          <LiveCaptionOverlay />
          <VoiceDock
            onMute={toggleMute}
            onAsk={(q) => {
              const text = q.trim();
              if (!text) return;

              // Live session: always chat — never rewrite the lesson topic.
              if (connection === "connected") {
                const client = clientRef.current;
                if (!client) return;
                sendStudentChat(text, client);
                return;
              }
              if (connection === "connecting") {
                pendingChatRef.current = text;
                useLessonUiStore.getState().appendTranscript({
                  role: "you",
                  text,
                });
                return;
              }

              // Idle / error
              const existingTopic = searchParams.get("topic")?.trim();
              if (isChitchatNotTopic(text)) {
                // Greeting while a real topic lesson exists — restart & send as chat.
                if (existingTopic && !isChitchatNotTopic(existingTopic)) {
                  setError(null);
                  pendingChatRef.current = text;
                  autoStarted.current = null;
                  void startLesson();
                  return;
                }
                setError(
                  "Say what you'd like to learn — e.g. “Pythagorean theorem”.",
                );
                return;
              }

              setError(null);
              pendingChatRef.current = null;
              const topic = normalizeTopic(text);
              setTopicRequest(topic, `Teach me: ${text}`);
              autoStarted.current = null;
              navigate(`/lesson?topic=${encodeURIComponent(topic)}`);
            }}
          />
          {error && connection !== "idle" && (
            <p className="live-error">{error}</p>
          )}
        </div>

        <MentoraSidebar />
      </div>
    </section>
  );
}
