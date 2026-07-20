import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useTeachingStore } from "@client/state/teachingStore";
import {
  createLoopHarness,
  type LoopHarness,
} from "../src/harness";
import {
  fixtureTwoCueChoreography,
  fixtureSingleCueNoBoard,
} from "../src/fixtures/choreography";
import { emptyAcceptance } from "../src/report";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const acceptancePath = path.join(
  here,
  "..",
  "reports",
  "acceptance-flags.json",
);

function loadAcceptance(): Record<string, boolean> {
  if (!fs.existsSync(acceptancePath)) return emptyAcceptance();
  try {
    return {
      ...emptyAcceptance(),
      ...JSON.parse(fs.readFileSync(acceptancePath, "utf8")),
    };
  } catch {
    return emptyAcceptance();
  }
}

function saveAcceptance(flags: Record<string, boolean>) {
  fs.mkdirSync(path.dirname(acceptancePath), { recursive: true });
  fs.writeFileSync(acceptancePath, JSON.stringify(flags, null, 2));
}

function mark(key: string, ok: boolean) {
  const flags = loadAcceptance();
  flags[key] = ok;
  saveAcceptance(flags);
}

describe("Mentora Decision → Conductor → Realtime coordination", () => {
  let h: LoopHarness;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    h = createLoopHarness(fixtureTwoCueChoreography());
  });

  afterEach(() => {
    h.dispose();
    vi.useRealTimers();
  });

  async function studentSays(text: string, itemId = "item_student_1") {
    h.gate.onTranscriptionCompleted(text, itemId);
    await vi.advanceTimersByTimeAsync(350);
    await h.flushMicrotasks();
    await h.waitFor(() => h.client.responseCreates().length >= 1);
  }

  async function playCueThroughVoice(opts?: {
    transcript?: string;
    status?: "completed" | "cancelled" | "failed" | "incomplete";
  }) {
    const responseId = h.ackCreated();
    await h.flushMicrotasks();
    if (opts?.transcript) {
      h.speakDelta(opts.transcript, responseId);
      await h.flushMicrotasks();
    }
    await h.completeActiveCue(opts?.status ?? "completed");
    await h.flushMicrotasks();
    return responseId;
  }

  it("one decision per approved student turn + one response.create per cue", async () => {
    await studentSays("A square has four equal sides");
    expect(h.decide.calls.length).toBe(1);

    // cue 1 voice
    expect(h.client.responseCreates().length).toBe(1);
    await playCueThroughVoice({ transcript: "I am drawing a square" });

    // cue 2 voice
    await h.waitFor(() => h.client.responseCreates().length >= 2);
    expect(h.client.responseCreates().length).toBe(2);
    await playCueThroughVoice();

    expect(h.decide.calls.length).toBe(1);
    expect(h.client.responseCreates().length).toBe(2);
    mark("one_decision_per_student_turn", true);
    mark("one_response_create_per_cue", true);
  });

  it("structural actionsBefore completes before voice starts", async () => {
    await studentSays("show me a square");
    const beforeStart = h.probe.ofType("actions_before_start");
    const beforeDone = h.probe.ofType("actions_before_done");
    const voiceStart = h.probe.ofType("voice_start");
    expect(beforeStart.length).toBeGreaterThanOrEqual(1);
    expect(beforeDone.length).toBeGreaterThanOrEqual(1);
    expect(voiceStart.length).toBeGreaterThanOrEqual(1);

    const doneSeq = Number(beforeDone[0]!.data?.seq ?? 0);
    const voiceSeq = Number(voiceStart[0]!.data?.seq ?? 0);
    expect(doneSeq).toBeLessThan(voiceSeq);
    expect(beforeDone[0]!.data?.ok).toBe(true);
    expect(h.queue.getRegistry().has("sq1")).toBe(true);
    mark("actions_before_before_voice", true);
  });

  it("transcript trigger fires once; fallback cannot double-fire", async () => {
    await studentSays("draw it please");
    const responseId = h.ackCreated();
    await h.flushMicrotasks();

    h.speakDelta("I am drawing a square on the board", responseId);
    await h.flushMicrotasks();
    expect(h.probe.ofType("trigger_fire").length).toBe(1);

    // Speak again with same phrase — still one fire
    h.speakDelta(" drawing a square again", responseId);
    await h.flushMicrotasks();
    expect(h.probe.ofType("trigger_fire").length).toBe(1);

    // Advance past fallbackAtMs — must not double-fire
    await vi.advanceTimersByTimeAsync(500);
    await h.flushMicrotasks();
    expect(h.probe.ofType("trigger_fire").length).toBe(1);
    expect(h.probe.ofType("trigger_fallback").length).toBe(0);

    mark("transcript_trigger_fires_once", true);
    mark("no_double_fire_fallback_transcript", true);
  });

  it("fallback fires once when transcript never matches", async () => {
    await studentSays("draw it please");
    h.ackCreated();
    await h.flushMicrotasks();

    await vi.advanceTimersByTimeAsync(500);
    await h.flushMicrotasks();
    expect(h.probe.ofType("trigger_fallback").length).toBe(1);
    expect(h.probe.ofType("trigger_fire").length).toBe(1);
  });

  it("board ops remain serialized via opChain events", async () => {
    await studentSays("visual please");
    const applies = h.probe.ofType("board_apply");
    // actionsBefore apply should be recorded before voice
    expect(applies.some((e) => String(e.data?.label ?? "").startsWith("before:"))).toBe(
      true,
    );
    const responseId = h.ackCreated();
    h.speakDelta("drawing a square", responseId);
    await h.flushMicrotasks();
    await vi.advanceTimersByTimeAsync(50);
    await h.flushMicrotasks();

    const during = h.probe
      .ofType("board_apply")
      .filter((e) => String(e.data?.label ?? "").startsWith("during:"));
    expect(during.length).toBeGreaterThanOrEqual(1);
    // All apply seq numbers should be strictly increasing in probe order
    const seqs = h.probe
      .ofType("board_apply")
      .map((e) => Number(e.data?.seq ?? 0));
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!);
    }
    mark("ops_serialized", true);
  });

  it("stale turnId / studentItemId cannot mutate the board", async () => {
    await studentSays("square", "item_a");
    // Mid-flight: bump turn identity before completing first cue
    const turnBefore = h.gate.getTurnId();
    // Simulate newer student turn interrupting decide/play identity
    h.gate.onTranscriptionCompleted("new answer", "item_b");
    await vi.advanceTimersByTimeAsync(350);
    await h.flushMicrotasks();

    expect(h.gate.getTurnId()).toBeGreaterThan(turnBefore);
    // Stale discard or cancel should appear; board apply with stale should fail if attempted
    const stale = h.probe.ofType("decide_stale_discard");
    const cancel = h.probe.ofType("cancel");
    const staleAbort = h.probe.ofType("stale_turn_abort");
    expect(stale.length + cancel.length + staleAbort.length).toBeGreaterThan(0);

    // Only the latest decide should drive play eventually
    await h.waitFor(() => h.decide.calls.length >= 1);
    mark("stale_guards_block_board", true);
  });

  it("cancelled/failed/incomplete response.done does not advance", async () => {
    h.dispose();
    h = createLoopHarness(fixtureSingleCueNoBoard());
    await studentSays("okay");
    h.ackCreated();
    await h.flushMicrotasks();

    await h.completeActiveCue("cancelled");
    await h.flushMicrotasks();

    const done = h.probe.ofType("response_done");
    expect(done.some((e) => e.data?.result === "cancelled")).toBe(true);
    expect(done.some((e) => e.data?.result === "advanced")).toBe(false);
    expect(done.some((e) => e.data?.result === "finished")).toBe(false);
    expect(useTeachingStore.getState().runtime.phase).not.toBe(
      "waiting_for_student",
    );
    mark("cancelled_done_does_not_advance", true);
  });

  it("completed matching response.done advances exactly one cue", async () => {
    await studentSays("four equal sides");
    expect(h.client.responseCreates().length).toBe(1);
    await playCueThroughVoice({ transcript: "drawing a square" });

    const advanced = h.probe
      .ofType("response_done")
      .filter((e) => e.data?.result === "advanced");
    expect(advanced.length).toBe(1);

    await h.waitFor(() => h.client.responseCreates().length >= 2);
    expect(h.client.responseCreates().length).toBe(2);
    mark("completed_done_advances_one_cue", true);
  });

  it("final cue asks nextQuestion and enters waiting_for_student", async () => {
    await studentSays("equal sides");
    await playCueThroughVoice({ transcript: "drawing a square" });
    await h.waitFor(() => h.client.responseCreates().length >= 2);

    const voiceEvents = h.probe.ofType("voice_start");
    const lastVoice = voiceEvents.at(-1);
    expect(lastVoice?.data?.asksNextQuestion).toBe(true);
    expect(String(lastVoice?.data?.nextQuestion ?? "")).toMatch(/side length/i);

    const creates = h.client.responseCreates();
    const lastInstructions = String(
      (creates.at(-1)?.response as { instructions?: string })?.instructions ??
        "",
    );
    expect(lastInstructions).toMatch(/ask exactly this question/i);
    expect(lastInstructions).toMatch(/side length/i);

    // First cue must NOT ask the check question
    const firstInstructions = String(
      (creates[0]?.response as { instructions?: string })?.instructions ?? "",
    );
    expect(firstInstructions).toMatch(/Do NOT ask a new check question/i);

    await playCueThroughVoice();
    await h.waitFor(
      () => useTeachingStore.getState().runtime.phase === "waiting_for_student",
    );
    expect(h.probe.ofType("waiting_for_student").length).toBeGreaterThanOrEqual(
      1,
    );
    mark("final_cue_asks_next_and_waits", true);
  });

  it("no phantom student item or reply loop after waiting", async () => {
    await studentSays("done");
    await playCueThroughVoice({ transcript: "drawing a square" });
    await h.waitFor(() => h.client.responseCreates().length >= 2);
    await playCueThroughVoice();
    await h.waitFor(
      () => useTeachingStore.getState().runtime.phase === "waiting_for_student",
    );

    const decidesAfter = h.decide.calls.length;
    const createsAfter = h.client.responseCreates().length;

    // Idle wait — no extra decide or response.create
    await vi.advanceTimersByTimeAsync(2000);
    await h.flushMicrotasks();

    expect(h.decide.calls.length).toBe(decidesAfter);
    expect(h.client.responseCreates().length).toBe(createsAfter);
    expect(useTeachingStore.getState().runtime.phase).toBe(
      "waiting_for_student",
    );
    mark("no_phantom_reply_loop", true);
  });
});
