import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { StudentBoardUpdate } from "@mentora/shared";
import { isSquareFormulaTopic } from "@mentora/shared";
import { fetchRealtimeToken } from "../api/realtimeApi";
import { createLessonPlan } from "../api/lessonApi";
import { RealtimeClient } from "../realtime/RealtimeClient";
import { EventRouter, toolsForSession } from "../realtime/EventRouter";
import { MENTORA_INSTRUCTIONS } from "../realtime/instructions";
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

const REALTIME_MODEL =
  import.meta.env.VITE_OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
const DEMO_SAFE = import.meta.env.VITE_DEMO_SAFE_MODE === "true";

function ingestTranscriptEvent(event: Record<string, unknown>) {
  const type = String(event.type ?? "");
  const ui = useLessonUiStore.getState();

  if (
    type === "response.output_audio_transcript.delta" ||
    type === "response.audio_transcript.delta"
  ) {
    const delta = String(event.delta ?? "");
    if (delta) ui.appendOrUpdateStreaming("mentora", delta);
    return;
  }

  if (
    type === "response.output_audio_transcript.done" ||
    type === "response.audio_transcript.done"
  ) {
    const full = String(event.transcript ?? "");
    if (full) {
      ui.finalizeStreaming("mentora");
      const last = useLessonUiStore.getState().transcript.at(-1);
      if (!last || last.text !== full) {
        ui.appendTranscript({ role: "mentora", text: full });
      }
    } else {
      ui.finalizeStreaming("mentora");
    }
    return;
  }

  if (
    type === "conversation.item.input_audio_transcription.completed" ||
    type === "conversation.item.input_audio_transcription.delta"
  ) {
    const text = String(event.transcript ?? event.delta ?? "");
    if (!text) return;
    if (type.endsWith(".delta")) {
      ui.appendOrUpdateStreaming("you", text);
    } else {
      ui.finalizeStreaming("you");
      ui.appendTranscript({ role: "you", text });
    }
  }
}

export function LessonSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { queue } = useBoard();
  const clientRef = useRef<RealtimeClient | null>(null);
  const routerRef = useRef<EventRouter | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const watchdogRef = useRef<SilenceWatchdog | null>(null);
  const autoStarted = useRef<string | null>(null);
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
      setTopicRequest(fromUrl, `Teach me: ${fromUrl}`);
      return fromUrl;
    }
    const fromStore = topicRequest.trim();
    if (fromStore) return fromStore;
    return "Expanding (a+b)^2";
  };

  const hintInstructions = () => {
    const level = usePrefsStore.getState().hintsLevel;
    if (level === "guided") {
      return {
        first: "Nudge warmly and offer a concrete starter hint.",
        second:
          "Give a stronger guided hint and point at the relevant board object if possible. Do not dump the full answer.",
      };
    }
    if (level === "minimal") {
      return {
        first: "Very gentle nudge only — invite them to speak or draw.",
        second: "Ask if they want a tiny hint. Keep it minimal.",
      };
    }
    return {
      first:
        "Gently nudge once: take your time — speak or draw on the board.",
      second:
        "Ask 'still thinking?' and give a light hint. Do not reveal the full answer.",
    };
  };

  useEffect(() => {
    const prefs = usePrefsStore.getState();
    const hints = hintInstructions();
    watchdogRef.current = new SilenceWatchdog(
      {
        isWaiting: () =>
          useTeachingStore.getState().runtime.phase === "waiting_for_student",
        isSuspended: () =>
          useTeachingStore.getState().runtime.studentBoardActive ||
          useBoardStore.getState().studentBoardActive,
        onFirstNudge: () => {
          clientRef.current?.sendEvent({
            type: "response.create",
            response: { instructions: hints.first },
          });
        },
        onSecondNudge: () => {
          useTeachingStore.getState().bumpHints();
          clientRef.current?.sendEvent({
            type: "response.create",
            response: { instructions: hints.second },
          });
        },
      },
      HINTS_TO_DELAY_MS[prefs.hintsLevel],
    );
    return () => {
      watchdogRef.current?.clear();
      void clientRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (runtime.phase === "waiting_for_student") watchdogRef.current?.reset();
    else watchdogRef.current?.clear();
  }, [runtime.phase, runtime.studentBoardActive]);

  useEffect(() => {
    if (runtime.phase === "complete") {
      playUiBeep("done");
      navigate("/summary");
    }
  }, [runtime.phase, navigate]);

  const injectStudentBoardUpdate = (payload: StudentBoardUpdate) => {
    const { text } = liveBoardSnapshot(queue.getRegistry());
    clientRef.current?.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `student_board_update: ${JSON.stringify(payload)}

CURRENT PIXEL BOARD MAP:
${text}`,
          },
        ],
      },
    });
    clientRef.current?.sendEvent({
      type: "response.create",
      response: {
        instructions:
          "Student added something on the board (ink or shape/text). Use the PIXEL BOARD MAP — acknowledge and continue without overlapping existing boxes.",
      },
    });
  };

  const startLesson = async () => {
    setBusy(true);
    setError(null);
    await clientRef.current?.disconnect();
    clientRef.current = null;
    resetTeaching();
    clearStudentStrokes();
    clearStudentPlaced();
    clearLessonUi();
    const topic = resolveTopic();
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
      setPlan(planned.plan, planned.source);
      patchRuntime({
        phase: "teaching",
        planTitle: planned.plan.title,
        startedAt: Date.now(),
      });

      // Recreate watchdog with current hint prefs
      const hints = hintInstructions();
      watchdogRef.current?.clear();
      watchdogRef.current = new SilenceWatchdog(
        {
          isWaiting: () =>
            useTeachingStore.getState().runtime.phase === "waiting_for_student",
          isSuspended: () =>
            useTeachingStore.getState().runtime.studentBoardActive ||
            useBoardStore.getState().studentBoardActive,
          onFirstNudge: () => {
            clientRef.current?.sendEvent({
              type: "response.create",
              response: { instructions: hints.first },
            });
          },
          onSecondNudge: () => {
            useTeachingStore.getState().bumpHints();
            clientRef.current?.sendEvent({
              type: "response.create",
              response: { instructions: hints.second },
            });
          },
        },
        HINTS_TO_DELAY_MS[prefs.hintsLevel],
      );

      const token = await fetchRealtimeToken();
      const client = new RealtimeClient({
        onState: setConnection,
        onVoiceUi: (ui) => {
          setVoiceUi(ui);
          if (ui === "waiting") playUiBeep("ready");
        },
        onError: setError,
        onRemoteStream: (stream) => {
          if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.autoplay = true;
          }
          audioRef.current.srcObject = stream;
          void audioRef.current.play().catch(() => undefined);
        },
        onEvent: (event) => {
          void routerRef.current?.onEvent(event);
          ingestTranscriptEvent(event);
          if (event.type === "input_audio_buffer.speech_started") {
            watchdogRef.current?.clear();
            if (
              useTeachingStore.getState().runtime.phase === "waiting_for_student"
            ) {
              patchRuntime({ phase: "evaluating", wasInterrupted: true });
            }
          }
        },
      });
      clientRef.current = client;
      routerRef.current = new EventRouter(client, queue);

      await client.connect(token.value, REALTIME_MODEL);
      client.updateSession({
        type: "realtime",
        instructions: `${MENTORA_INSTRUCTIONS}\n\nHint style preference: ${prefs.hintsLevel}.`,
        tools: toolsForSession(),
        tool_choice: "auto",
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: {
              type: "semantic_vad",
              eagerness: "low",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            voice: prefs.voice,
            speed: SPEED_TO_NUMBER[prefs.speechSpeed],
          },
        },
      });
      await client.waitForSessionUpdated();

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
      console.info("[mentora:board:seed]", drawn);
      patchRuntime({ boardObjectIds: queue.getRegistry().listIds() });
      useLessonUiStore.getState().appendTranscript({
        role: "system",
        text: `Lesson started: ${planned.plan.title}`,
      });

      const objectIds = queue.getRegistry().listIds();
      const { text: boardMapText } = liveBoardSnapshot(queue.getRegistry());
      client.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Start teaching "${planned.plan.title}" about "${topic}" (source=${planned.source}).
Board objectIds already present: ${JSON.stringify(objectIds)}.

CURRENT PIXEL BOARD MAP (trust this — do not guess positions):
${boardMapText}

You MUST keep calling board_apply_actions for diagrams/labels and use the red pointer while explaining.
After each teaching beat: ASK one check question, then update_lesson_state phase=waiting_for_student, and wait.
After every board tool, read boardMapText (px ranges). Call get_board_layout only if placement failed.
Teach this exact topic — do not switch to a different subject.
Plan: ${JSON.stringify(planned.plan)}`,
            },
          ],
        },
      });
      client.sendEvent({
        type: "response.create",
        response: {
          instructions: `Greet briefly as Mentora. Teach "${topic}" visually. After the first idea, ASK a check question and set waiting_for_student. Use the PIXEL BOARD MAP. Prefer freeSlots. Tools required.`,
          tools: toolsForSession(),
          tool_choice: "auto",
        },
      });
      playUiBeep("ready");
    } catch (err) {
      setConnection("error");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const topic = searchParams.get("topic")?.trim();
    if (!topic || autoStarted.current === topic) return;
    autoStarted.current = topic;
    setTopicRequest(topic, `Teach me: ${topic}`);
    void startLesson();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
    await clientRef.current?.disconnect();
    clientRef.current = null;
    patchRuntime({ phase: "complete", completedAt: Date.now() });
  };

  const exitLesson = async () => {
    await clientRef.current?.disconnect();
    clientRef.current = null;
    setConnection("idle");
    navigate("/");
  };

  const restart = async () => {
    await clientRef.current?.disconnect();
    clientRef.current = null;
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
          <div className={`board-frame ${empty && connection === "idle" ? "empty" : ""}`}>
            {empty && connection === "idle" && (
              <div className="board-empty">
                <p>Your shared whiteboard</p>
                <span>Press Start lesson above, or type a topic below.</span>
                {error && <p className="err">{error}</p>}
              </div>
            )}
            <BoardCanvas
              autoPlaySquareDemo={false}
              hideToolbar
              onStudentBoardUpdate={injectStudentBoardUpdate}
            />
          </div>
          <VoiceDock
            onMute={toggleMute}
            onAsk={(q) => {
              if (connection === "idle" || connection === "error") {
                setTopicRequest(q, `Teach me: ${q}`);
                autoStarted.current = null;
                navigate(`/lesson?topic=${encodeURIComponent(q)}`);
                return;
              }
              useLessonUiStore.getState().appendTranscript({
                role: "you",
                text: q,
              });
              clientRef.current?.sendEvent({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [{ type: "input_text", text: q }],
                },
              });
              clientRef.current?.sendEvent({
                type: "response.create",
                response: {
                  instructions:
                    "Answer the student's typed question. Use the board if a visual helps. Stay on the current lesson topic unless they clearly ask to switch.",
                },
              });
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
