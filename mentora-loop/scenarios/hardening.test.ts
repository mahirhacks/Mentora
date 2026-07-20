import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createLoopHarness, type LoopHarness } from "../src/harness";
import {
  fixtureTwoCueChoreography,
  fixtureSingleCueNoBoard,
} from "../src/fixtures/choreography";
import { useTeachingStore } from "@client/state/teachingStore";

describe("production hardening regressions", () => {
  let h: LoopHarness;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    h?.dispose();
    vi.useRealTimers();
  });

  async function studentSays(text: string, itemId = "item_1") {
    h.gate.onTranscriptionCompleted(text, itemId);
    await vi.advanceTimersByTimeAsync(350);
    await h.flushMicrotasks();
    await h.waitFor(() => h.client.responseCreates().length >= 1);
  }

  it("D: cancelled choreography does not commit understandingDelta or completedStepId", async () => {
    const choreo = fixtureSingleCueNoBoard();
    choreo.classification = "correct_with_understanding";
    choreo.understandingDelta = 0.2;
    choreo.completedStepId = "step_should_not_complete";
    h = createLoopHarness(choreo);

    const before = useTeachingStore.getState().runtime;
    expect(before.completedStepIds).not.toContain("step_should_not_complete");
    const understandingBefore = before.understanding;

    await studentSays("yes");
    h.ackCreated();
    await h.flushMicrotasks();
    await h.completeActiveCue("cancelled");
    await h.flushMicrotasks();

    const after = useTeachingStore.getState().runtime;
    expect(after.completedStepIds).not.toContain("step_should_not_complete");
    // understandingDelta must not apply on cancel
    expect(after.understanding).toBeLessThanOrEqual(
      understandingBefore + 0.001,
    );
    // early classification must not have bumped understanding either
    expect(after.understanding).toBe(understandingBefore);
  });

  it("D: successful finish commits understandingDelta and step once", async () => {
    const choreo = fixtureSingleCueNoBoard();
    choreo.classification = "correct_with_understanding";
    choreo.understandingDelta = 0.1;
    choreo.completedStepId = "step_ok";
    h = createLoopHarness(choreo);

    const understandingBefore = useTeachingStore.getState().runtime.understanding;
    await studentSays("yes");
    h.ackCreated();
    await h.flushMicrotasks();
    await h.completeActiveCue("completed");
    await h.waitFor(
      () => useTeachingStore.getState().runtime.phase === "waiting_for_student",
    );

    const after = useTeachingStore.getState().runtime;
    expect(after.completedStepIds).toContain("step_ok");
    expect(after.understanding).toBeCloseTo(
      Math.min(1, understandingBefore + 0.08 + 0.1),
      5,
    );
    expect(after.questionsAsked).toBe(1);
  });

  it("F: metadata-mismatched response.created does not attach; terminal done clears stuck state", async () => {
    h = createLoopHarness(fixtureSingleCueNoBoard());
    await studentSays("okay");

    // Inject a created event with wrong metadata — must not arm conductor
    h.gate.onResponseCreated({
      type: "response.created",
      response: {
        id: "resp_wrong",
        metadata: {
          kind: "teaching_cue",
          turnId: "999",
          beatId: "nope",
          cueId: "nope",
        },
      },
    });
    expect(h.gate.conductor.getActiveResponseId()).toBeNull();

    // Complete with matching metadata from the real create, but conductor never attached
    const create = h.client.responseCreates()[0]!;
    const meta = (create.response as { metadata: Record<string, string> })
      .metadata;
    h.gate.onResponseFinished(
      {
        type: "response.done",
        response: {
          id: "resp_orphan",
          status: "cancelled",
          metadata: meta,
        },
      },
      true,
    );
    await h.flushMicrotasks();
    await h.flushMicrotasks();

    expect(h.gate.conductor.isPlaying()).toBe(false);
    expect(useTeachingStore.getState().runtime.phase).toBe(
      "waiting_for_student",
    );
  });

  it("C: cancel invalidates in-flight board applies (no stale boardVersion bump)", async () => {
    h = createLoopHarness(fixtureTwoCueChoreography());
    await studentSays("draw");

    const versionAtVoice = useTeachingStore.getState().runtime.boardVersion;
    // Cancel mid-play — subsequent orphaned applies must not mutate
    h.gate.conductor.cancel();
    await h.flushMicrotasks();
    await vi.advanceTimersByTimeAsync(100);
    await h.flushMicrotasks();

    expect(useTeachingStore.getState().runtime.boardVersion).toBe(
      versionAtVoice,
    );
  });

  it("E: actionsBefore failure softens voice and does not claim a draw", async () => {
    const choreo = fixtureTwoCueChoreography();
    // Force CAS failure by using a bogus expected board version path:
    // replace create with an op targeting missing parent via divide without parent
    choreo.cues[0]!.actionsBefore = [
      {
        op: "divide_region",
        parentId: "missing_parent",
        layout: "2x2-grid",
        cells: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
          { id: "c", label: "C" },
          { id: "d", label: "D" },
        ],
      },
    ];
    choreo.cues[0]!.voiceScript =
      "I just drew four new cells on the board for you.";
    h = createLoopHarness(choreo);

    await studentSays("visual");
    const instructions = String(
      (h.client.responseCreates()[0]?.response as { instructions?: string })
        ?.instructions ?? "",
    );
    expect(instructions.toLowerCase()).not.toMatch(/i just drew four new cells/);
    expect(instructions).toMatch(/already on the board|keep using what's already/i);
  });
});
