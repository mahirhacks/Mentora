import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useNavigate } from "react-router-dom";
import type { StudentBoardUpdate } from "@mentora/shared";
import { fetchRealtimeToken } from "../api/realtimeApi";
import { RealtimeClient } from "../realtime/RealtimeClient";
import { EventRouter, toolsForSession } from "../realtime/EventRouter";
import { MENTORA_INSTRUCTIONS } from "../realtime/instructions";
import { useSessionStore } from "../state/sessionStore";
import { useTeachingStore } from "../state/teachingStore";
import { useBoardStore } from "../state/boardStore";
import { useBoard } from "../board/BoardContext";
import { SilenceWatchdog } from "../teaching/silenceWatchdog";
import { createLessonPlan } from "../api/lessonApi";
import { squareFormulaBoardActions } from "../board/squareDemo";

const REALTIME_MODEL =
  import.meta.env.VITE_OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
const DEMO_SAFE = import.meta.env.VITE_DEMO_SAFE_MODE === "true";

type Props = {
  onStudentBoardUpdateRef?: MutableRefObject<
    ((payload: StudentBoardUpdate) => void) | null
  >;
};

export function LessonControls({ onStudentBoardUpdateRef }: Props) {
  const navigate = useNavigate();
  const { queue } = useBoard();
  const clientRef = useRef<RealtimeClient | null>(null);
  const routerRef = useRef<EventRouter | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const watchdogRef = useRef<SilenceWatchdog | null>(null);
  const [busy, setBusy] = useState(false);

  const connection = useSessionStore((s) => s.connection);
  const voiceUi = useSessionStore((s) => s.voiceUi);
  const muted = useSessionStore((s) => s.muted);
  const error = useSessionStore((s) => s.error);
  const setConnection = useSessionStore((s) => s.setConnection);
  const setVoiceUi = useSessionStore((s) => s.setVoiceUi);
  const setMuted = useSessionStore((s) => s.setMuted);
  const setError = useSessionStore((s) => s.setError);

  const runtime = useTeachingStore((s) => s.runtime);
  const plan = useTeachingStore((s) => s.plan);
  const patchRuntime = useTeachingStore((s) => s.patchRuntime);
  const setPlan = useTeachingStore((s) => s.setPlan);
  const resetTeaching = useTeachingStore((s) => s.resetTeaching);
  const hintsUsed = useTeachingStore((s) => s.hintsUsed);

  useEffect(() => {
    watchdogRef.current = new SilenceWatchdog({
      isWaiting: () =>
        useTeachingStore.getState().runtime.phase === "waiting_for_student",
      isSuspended: () =>
        useTeachingStore.getState().runtime.studentBoardActive ||
        useBoardStore.getState().studentBoardActive,
      onFirstNudge: () => {
        clientRef.current?.sendEvent({
          type: "response.create",
          response: {
            instructions:
              "Gently nudge the student once: take your time, you can speak or draw on the board.",
          },
        });
      },
      onSecondNudge: () => {
        useTeachingStore.getState().bumpHints();
        clientRef.current?.sendEvent({
          type: "response.create",
          response: {
            instructions:
              "Ask 'still thinking?' and offer a light hint from the current step hint ladder. Do not reveal the full answer.",
          },
        });
      },
    });
    return () => {
      watchdogRef.current?.clear();
      void clientRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (runtime.phase === "waiting_for_student") {
      watchdogRef.current?.reset();
    } else {
      watchdogRef.current?.clear();
    }
  }, [runtime.phase, runtime.studentBoardActive]);

  useEffect(() => {
    if (runtime.phase === "complete") {
      navigate("/summary");
    }
  }, [runtime.phase, navigate]);

  const injectStudentBoardUpdate = (payload: StudentBoardUpdate) => {
    clientRef.current?.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `student_board_update: ${JSON.stringify(payload)}`,
          },
        ],
      },
    });
    clientRef.current?.sendEvent({
      type: "response.create",
      response: {
        instructions:
          "The student drew on the whiteboard. Acknowledge their speech (if any) AND the drawing using the student_board_update JSON. React pedagogically and continue.",
      },
    });
  };

  useEffect(() => {
    if (onStudentBoardUpdateRef) {
      onStudentBoardUpdateRef.current = injectStudentBoardUpdate;
    }
  });

  const startLesson = async () => {
    setBusy(true);
    setError(null);
    resetTeaching();
    try {
      const planned = await createLessonPlan({
        topic: "Expanding (a+b)^2",
        studentRequest: "Teach me with the area model on the whiteboard",
        demoSafeMode: DEMO_SAFE,
      });
      setPlan(planned.plan, planned.source);
      patchRuntime({
        phase: "teaching",
        planTitle: planned.plan.title,
        startedAt: Date.now(),
      });

      const token = await fetchRealtimeToken();
      const client = new RealtimeClient({
        onState: setConnection,
        onVoiceUi: setVoiceUi,
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
          const type = String(event.type ?? "");
          if (type === "input_audio_buffer.speech_started") {
            watchdogRef.current?.clear();
            if (
              useTeachingStore.getState().runtime.phase ===
              "waiting_for_student"
            ) {
              patchRuntime({ phase: "evaluating", wasInterrupted: true });
            }
          }
        },
      });
      clientRef.current = client;
      const router = new EventRouter(client, queue);
      routerRef.current = router;

      await client.connect(token.value, REALTIME_MODEL);
      client.updateSession({
        type: "realtime",
        instructions: MENTORA_INSTRUCTIONS,
        tools: toolsForSession(),
        tool_choice: "auto",
        output_modalities: ["audio"],
        audio: {
          input: {
            turn_detection: {
              type: "semantic_vad",
              eagerness: "low",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { voice: "marin" },
        },
      });
      await client.waitForSessionUpdated();

      // Guarantee first visuals land even if the model is slow to tool-call
      const firstStep = planned.plan.steps[0];
      const seedActions =
        firstStep?.boardPlan?.length > 0
          ? firstStep.boardPlan
          : squareFormulaBoardActions();
      const drawn = await queue.applyActions({
        actions: [{ type: "clear_board" }, ...seedActions],
      });
      console.info("[mentora:board:seed]", drawn);
      useTeachingStore.getState().patchRuntime({
        boardObjectIds: queue.getRegistry().listIds(),
      });

      const objectIds = queue.getRegistry().listIds();
      client.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Start teaching Mentora lesson "${planned.plan.title}". Plan source=${planned.source}.
Step 1 board visuals are ALREADY drawn with objectIds: ${JSON.stringify(objectIds)}.
You MUST keep using board_apply_actions for later steps (lines, labels, equations, point_at, highlight).
Never teach without calling board tools when something should appear on the board.
Full plan JSON: ${JSON.stringify(planned.plan)}`,
            },
          ],
        },
      });
      client.sendEvent({
        type: "response.create",
        response: {
          instructions:
            "Greet briefly as Mentora. Narrate the square already on the board, then use board_apply_actions (point_at/highlight) on existing IDs. For the next visual change, call board_apply_actions again. Tools are required for teaching.",
          tools: toolsForSession(),
          tool_choice: "auto",
        },
      });
    } catch (err) {
      setConnection("error");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const stopAi = () => {
    clientRef.current?.stopResponse();
    queue.interruptDropPending();
  };

  const toggleMute = () => {
    const next = !muted;
    clientRef.current?.setMuted(next);
    setMuted(next);
  };

  const stopLesson = async () => {
    await clientRef.current?.disconnect();
    clientRef.current = null;
    patchRuntime({ phase: "complete", completedAt: Date.now() });
  };

  const restart = async () => {
    await clientRef.current?.disconnect();
    clientRef.current = null;
    setMuted(false);
    await startLesson();
  };

  const step = plan.steps[runtime.currentStepIndex];

  return (
    <div className="lesson-controls">
      <div className="voice-chip" data-state={voiceUi}>
        {voiceUi}
      </div>
      <div className="control-row">
        <button
          type="button"
          disabled={busy || connection === "connected" || connection === "connecting"}
          onClick={() => void startLesson()}
        >
          Start lesson
        </button>
        <button type="button" disabled={connection !== "connected"} onClick={stopAi}>
          Stop AI
        </button>
        <button
          type="button"
          disabled={connection !== "connected"}
          onClick={toggleMute}
        >
          {muted ? "Unmute mic" : "Mute mic"}
        </button>
        <button
          type="button"
          disabled={busy || connection === "idle"}
          onClick={() => void restart()}
        >
          Restart
        </button>
        <button
          type="button"
          className="danger"
          disabled={connection === "idle"}
          onClick={() => void stopLesson()}
        >
          Stop lesson
        </button>
      </div>
      <p className="meta">
        {connection} · phase {runtime.phase}
        {step ? ` · ${step.title}` : ""}
        {error ? ` · ${error}` : ""} · hints {hintsUsed}
      </p>
    </div>
  );
}
