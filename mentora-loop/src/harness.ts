import { BoardActionQueue } from "@client/board/ActionQueue";
import { BoardObjectRegistry } from "@client/board/ObjectRegistry";
import {
  makeGenericFallbackLesson,
} from "@mentora/shared";
import { useTeachingStore } from "@client/state/teachingStore";
import { useLessonUiStore } from "@client/state/lessonUiStore";
import { createInitialRuntime } from "@client/teaching/teachingStateMachine";
import {
  setMentoraProbeSink,
  resetMentoraProbe,
  type MentoraProbeEvent,
} from "@client/testing/mentoraTestProbe";
import { setActiveTurnGate } from "@client/realtime/turnGate";
import { TurnGate } from "@client/realtime/turnGate";
import { MockRealtimeClient } from "./mocks/realtimeMock";
import { createDecideMock, type DecideMock } from "./mocks/decideMock";
import {
  fixtureTwoCueChoreography,
} from "./fixtures/choreography";
import type { TeachingChoreography } from "@mentora/shared";

export type ProbeRecorder = {
  events: MentoraProbeEvent[];
  ofType: (type: string) => MentoraProbeEvent[];
  clear: () => void;
};

export type LoopHarness = {
  client: MockRealtimeClient;
  gate: TurnGate;
  queue: BoardActionQueue;
  decide: DecideMock;
  probe: ProbeRecorder;
  resetStores: () => void;
  dispose: () => void;
  /** Drive response.created for the latest response.create */
  ackCreated: () => string;
  /** Complete the active teaching cue with matching metadata */
  completeActiveCue: (status?: "completed" | "cancelled" | "failed" | "incomplete") => Promise<void>;
  /** Emit Mentora transcript delta for active response */
  speakDelta: (text: string, responseId?: string) => void;
  waitFor: (
    predicate: () => boolean,
    timeoutMs?: number,
  ) => Promise<void>;
  flushMicrotasks: () => Promise<void>;
};

export function createProbeRecorder(): ProbeRecorder {
  const events: MentoraProbeEvent[] = [];
  setMentoraProbeSink((e) => {
    events.push(e);
  });
  return {
    events,
    ofType: (type) => events.filter((e) => e.type === type),
    clear: () => {
      events.length = 0;
    },
  };
}

export function createLoopHarness(
  choreo: TeachingChoreography = fixtureTwoCueChoreography(),
): LoopHarness {
  const probe = createProbeRecorder();
  const decide = createDecideMock(choreo);
  decide.install();

  const registry = new BoardObjectRegistry();
  const queue = new BoardActionQueue(registry, {
    onRegistryChange: () => undefined,
    onFocusChange: () => undefined,
    onClearStudentLayer: () => undefined,
    sleep: async () => undefined,
  });

  const client = new MockRealtimeClient();
  const gate = new TurnGate(client.asClient(), {
    getQueue: () => queue,
  });

  const resetStores = () => {
    const plan = makeGenericFallbackLesson("Squares");
    useTeachingStore.setState({
      plan,
      runtime: createInitialRuntime(),
      planSource: "mock",
      hintsUsed: 0,
      topicRequest: "Squares",
      studentRequest: "Teach me squares",
    });
    useLessonUiStore.getState().clearLessonUi();
  };

  resetStores();

  const flushMicrotasks = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  };

  const waitFor = async (predicate: () => boolean, timeoutMs = 5000) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("waitFor timeout");
      }
      await flushMicrotasks();
    }
  };

  const ackCreated = () => {
    const created = client.makeCreatedFromLastCreate();
    gate.onResponseCreated(created);
    return String(created.response.id);
  };

  const speakDelta = (text: string, responseId?: string) => {
    const id =
      responseId ??
      gate.conductor.getActiveResponseId() ??
      "";
    gate.onMentoraTranscriptDelta(text, id);
  };

  const completeActiveCue = async (
    status: "completed" | "cancelled" | "failed" | "incomplete" = "completed",
  ) => {
    const active = gate.conductor.getActiveResponseId();
    const cueId = gate.conductor.getActiveCueId();
    if (!active || !cueId) {
      throw new Error("No active cue to complete");
    }
    const lastCreate = [...client.responseCreates()].at(-1);
    const meta = (lastCreate?.response as { metadata?: Record<string, string> })
      ?.metadata ?? {};
    const done = client.makeDone({
      responseId: active,
      status,
      metadata: {
        kind: String(meta.kind ?? "teaching_cue"),
        turnId: String(meta.turnId ?? ""),
        beatId: String(meta.beatId ?? ""),
        cueId: String(meta.cueId ?? cueId),
      },
    });
    gate.onResponseFinished(done, status !== "completed");
    await flushMicrotasks();
    // conductor.onResponseFinished is async
    await flushMicrotasks();
    await new Promise((r) => setTimeout(r, 10));
  };

  return {
    client,
    gate,
    queue,
    decide,
    probe,
    resetStores,
    dispose: () => {
      decide.uninstall();
      gate.conductor.cancel();
      setActiveTurnGate(null);
      resetMentoraProbe();
    },
    ackCreated,
    completeActiveCue,
    speakDelta,
    waitFor,
    flushMicrotasks,
  };
}

/** Advance fake timers helper when used with vi.useFakeTimers */
export async function advanceStudentDebounce(
  harness: LoopHarness,
  vi: { advanceTimersByTimeAsync: (ms: number) => Promise<void> },
) {
  await vi.advanceTimersByTimeAsync(350);
  await harness.flushMicrotasks();
}
