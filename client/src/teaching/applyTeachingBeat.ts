import {
  compileDiagramOps,
  type BoardDiagramOp,
  type DiagramBox,
  type TeachingChoreography,
} from "@mentora/shared";
import type { BoardActionQueue } from "../board/ActionQueue";
import { objectPixelBox } from "../board/boardSpatialMap";
import { useTeachingStore } from "../state/teachingStore";
import {
  markStepComplete,
  recordClassification,
} from "./teachingStateMachine";

export type ApplyBeatResult =
  | { ok: true; boardVersion: number }
  | { ok: false; reason: "cas_mismatch" | "apply_failed" | "stale" };

function registryBoxes(queue: BoardActionQueue): Record<string, DiagramBox> {
  const out: Record<string, DiagramBox> = {};
  for (const obj of queue.getRegistry().list()) {
    out[obj.id] = objectPixelBox(obj);
  }
  return out;
}

function casOk(input: {
  turnId: number;
  expectedTurnId: number;
  studentItemId: string;
  expectedStudentItemId: string;
  baseBoardVersion: number;
}): boolean {
  if (input.turnId !== input.expectedTurnId) return false;
  if (input.studentItemId !== input.expectedStudentItemId) return false;
  const runtime = useTeachingStore.getState().runtime;
  return runtime.boardVersion === input.baseBoardVersion;
}

/** Apply boardOps with boardVersion CAS (before / during / after cue slots). */
export async function applyBeatStepOps(input: {
  queue: BoardActionQueue;
  boardOps: BoardDiagramOp[];
  turnId: number;
  expectedTurnId: number;
  studentItemId: string;
  expectedStudentItemId: string;
  baseBoardVersion: number;
  /** Return false to discard a completed apply (e.g. conductor cancelled mid-flight). */
  shouldCommit?: () => boolean;
}): Promise<ApplyBeatResult> {
  if (!casOk(input)) {
    const rt = useTeachingStore.getState().runtime;
    if (input.turnId !== input.expectedTurnId) {
      return { ok: false, reason: "stale" };
    }
    if (input.studentItemId !== input.expectedStudentItemId) {
      return { ok: false, reason: "stale" };
    }
    if (rt.boardVersion !== input.baseBoardVersion) {
      return { ok: false, reason: "cas_mismatch" };
    }
    return { ok: false, reason: "stale" };
  }

  if (input.boardOps.length > 0) {
    try {
      const { actions } = compileDiagramOps(
        input.boardOps,
        registryBoxes(input.queue),
      );
      if (actions.length) {
        const result = await input.queue.applyActions({ actions });
        if (!result.success) {
          return { ok: false, reason: "apply_failed" };
        }
      }
    } catch {
      return { ok: false, reason: "apply_failed" };
    }
  }

  if (input.shouldCommit && !input.shouldCommit()) {
    return { ok: false, reason: "stale" };
  }

  const after = useTeachingStore.getState().runtime;
  if (
    after.boardVersion !== input.baseBoardVersion ||
    input.turnId !== input.expectedTurnId
  ) {
    return { ok: false, reason: "cas_mismatch" };
  }

  const boardVersion = input.baseBoardVersion + 1;
  useTeachingStore.getState().patchRuntime({
    boardObjectIds: input.queue.getRegistry().listIds(),
    boardVersion,
  });
  return { ok: true, boardVersion };
}

/**
 * Record classification label only — no understanding / streak / step side effects.
 * Full runtime commit happens in finalizeBeatRuntime after the last cue succeeds.
 */
export function noteClassificationEarly(choreo: TeachingChoreography): void {
  useTeachingStore.getState().patchRuntime({
    lastClassification: choreo.classification,
  });
}

/**
 * Commit classification side effects + understandingDelta + questionsAsked +
 * completedStepId after the full choreography finishes successfully.
 */
export function finalizeBeatRuntime(choreo: TeachingChoreography): void {
  const after = useTeachingStore.getState().runtime;
  let next = recordClassification(after, choreo.classification);
  next = {
    ...next,
    understanding: Math.min(
      1,
      Math.max(0, next.understanding + choreo.understandingDelta),
    ),
    questionsAsked: next.questionsAsked + 1,
  };
  if (choreo.completedStepId) {
    next = markStepComplete(next, choreo.completedStepId);
  }
  useTeachingStore.getState().setRuntime(next);
}

/** Apply all choreography ops in one transaction (tests / legacy). */
export async function applyTeachingBeat(input: {
  queue: BoardActionQueue;
  beat: TeachingChoreography;
  turnId: number;
  expectedTurnId: number;
  studentItemId: string;
  expectedStudentItemId: string;
  baseBoardVersion: number;
}): Promise<ApplyBeatResult> {
  const allOps = input.beat.cues.flatMap((c) => [
    ...c.actionsBefore,
    ...c.actionsDuring.flatMap((t) => t.actions),
    ...c.actionsAfter,
  ]);
  const applied = await applyBeatStepOps({
    queue: input.queue,
    boardOps: allOps,
    turnId: input.turnId,
    expectedTurnId: input.expectedTurnId,
    studentItemId: input.studentItemId,
    expectedStudentItemId: input.expectedStudentItemId,
    baseBoardVersion: input.baseBoardVersion,
  });
  if (!applied.ok) return applied;
  finalizeBeatRuntime(input.beat);
  return applied;
}
