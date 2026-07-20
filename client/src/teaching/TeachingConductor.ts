import {
  fuzzyContains,
  softenFailedBoardVoice,
  stripChoreographyBoardOps,
  type BoardDiagramOp,
  type TeachingChoreography,
  type TeachingCue,
} from "@mentora/shared";
import type { BoardActionQueue } from "../board/ActionQueue";
import {
  finalizeBeatRuntime,
  noteClassificationEarly,
} from "./applyTeachingBeat";
import { applyBeatStepOps } from "./applyTeachingBeat";
import { buildVoiceCueInstructions } from "../realtime/instructions";
import type { RealtimeClient } from "../realtime/RealtimeClient";
import { useTeachingStore } from "../state/teachingStore";
import {
  buildSemanticBoard,
  formatSemanticBoardForVoice,
} from "../board/semanticBoard";
import { mentoraProbe } from "../testing/mentoraTestProbe";

export type ConductorVoiceStart = (input: {
  kind: "teaching_cue";
  turnId: number;
  beatId: string;
  cueId: string;
  instructions: string;
}) => void;

export type ConductorCtx = {
  turnId: number;
  beatId: string;
  studentItemId: string;
  studentAnswer: string;
  getQueue: () => BoardActionQueue;
  getExpectedTurnId: () => number;
  getExpectedStudentItemId: () => string;
  client: RealtimeClient;
  beginVoiceTurn: ConductorVoiceStart;
  onWaiting: () => void;
};

export type ConductorDoneResult =
  | "advanced"
  | "finished"
  | "cancelled"
  | "ignored";

/**
 * Plays TeachingChoreography: structural before → voice → transcript/fallback gestures → after.
 * Board applies are serialized; transcript sync is best-effort.
 */
export class TeachingConductor {
  private choreo: TeachingChoreography | null = null;
  private ctx: ConductorCtx | null = null;
  private cueIndex = 0;
  private transcriptBuffer = "";
  private firedTriggers = new Set<string>();
  private fallbackTimers: ReturnType<typeof setTimeout>[] = [];
  private activeResponseId: string | null = null;
  private activeCueId: string | null = null;
  private finalized = false;
  private classificationNoted = false;
  private playing = false;
  private boardDegraded = false;
  private opChain: Promise<void> = Promise.resolve();
  /** Bumped on cancel/play so in-flight applies cannot commit after interrupt. */
  private applyEpoch = 0;

  isPlaying() {
    return this.playing;
  }

  getActiveResponseId() {
    return this.activeResponseId;
  }

  getActiveCueId() {
    return this.activeCueId;
  }

  async play(choreography: TeachingChoreography, ctx: ConductorCtx) {
    this.cancel();
    this.choreo = choreography;
    this.ctx = ctx;
    this.cueIndex = 0;
    this.finalized = false;
    this.classificationNoted = false;
    this.boardDegraded = false;
    this.applyEpoch += 1;
    this.opChain = Promise.resolve();
    this.playing = true;
    mentoraProbe("conductor", "play_start", {
      turnId: ctx.turnId,
      beatId: ctx.beatId,
      cueCount: choreography.cues.length,
      nextQuestion: choreography.nextQuestion,
    });
    await this.playCue(0);
  }

  /**
   * Accept response id only after TurnGate validated metadata.
   */
  onResponseCreated(responseId: string) {
    if (!this.playing || !responseId) return;
    this.activeResponseId = responseId;
    mentoraProbe("conductor", "response_created", {
      responseId,
      cueId: this.activeCueId,
      cueIndex: this.cueIndex,
    });
    this.armFallbackTimers();
  }

  onTranscriptDelta(delta: string, responseId: string) {
    if (!this.playing || !this.choreo || !this.ctx) return;
    if (!this.activeResponseId || responseId !== this.activeResponseId) return;
    this.transcriptBuffer += delta;
    void this.matchTriggers();
  }

  async onResponseFinished(
    event: Record<string, unknown>,
  ): Promise<ConductorDoneResult> {
    if (!this.playing || !this.choreo || !this.ctx) return "ignored";

    const response = event.response as
      | {
          id?: string;
          status?: string;
          metadata?: Record<string, string | undefined>;
        }
      | undefined;
    const status = String(response?.status ?? "");
    const id = String(response?.id ?? "");
    const meta = response?.metadata ?? {};

    const completedOk =
      status === "completed" &&
      id === this.activeResponseId &&
      String(meta.kind ?? "") === "teaching_cue" &&
      String(meta.turnId ?? "") === String(this.ctx.turnId) &&
      String(meta.beatId ?? "") === this.ctx.beatId &&
      String(meta.cueId ?? "") === String(this.activeCueId ?? "");

    if (!completedOk) {
      if (id && id === this.activeResponseId) {
        console.info(
          "[mentora:conductor] cue cancelled/incomplete",
          status,
        );
        mentoraProbe("conductor", "response_done", {
          result: "cancelled",
          status,
          responseId: id,
          cueId: this.activeCueId,
        });
        this.clearFallbackTimers();
        this.playing = false;
        this.choreo = null;
        this.activeResponseId = null;
        this.activeCueId = null;
        this.ctx = null;
        return "cancelled";
      }
      mentoraProbe("conductor", "response_done", {
        result: "ignored",
        status,
        responseId: id,
      });
      return "ignored";
    }

    this.clearFallbackTimers();
    const cue = this.choreo.cues[this.cueIndex];
    if (cue?.actionsAfter.length) {
      const afterOk = await this.queueOps(
        cue.actionsAfter,
        `after:${cue.cueId}`,
      );
      if (!afterOk) {
        console.warn("[mentora:conductor] actionsAfter failed", cue.cueId);
        mentoraProbe("conductor", "actions_after_failed", {
          cueId: cue.cueId,
        });
        // Voice already finished for this cue — strip remaining board work only.
        this.boardDegraded = true;
        this.degradeRemainingCues(this.cueIndex + 1);
      }
    }

    const next = this.cueIndex + 1;
    if (next < this.choreo.cues.length) {
      mentoraProbe("conductor", "response_done", {
        result: "advanced",
        responseId: id,
        fromCueId: cue?.cueId,
        nextCueIndex: next,
      });
      this.cueIndex = next;
      await this.playCue(next);
      return "advanced";
    }

    // Full choreography finished successfully — commit understanding / step
    if (!this.finalized) {
      finalizeBeatRuntime(this.choreo);
      this.finalized = true;
    }

    const waiting = this.ctx.onWaiting;
    this.playing = false;
    this.choreo = null;
    this.activeResponseId = null;
    this.activeCueId = null;
    this.ctx = null;
    mentoraProbe("conductor", "response_done", {
      result: "finished",
      responseId: id,
    });
    waiting();
    return "finished";
  }

  cancel() {
    const wasPlaying = this.playing;
    this.applyEpoch += 1;
    this.clearFallbackTimers();
    this.choreo = null;
    this.ctx = null;
    this.transcriptBuffer = "";
    this.firedTriggers.clear();
    this.activeResponseId = null;
    this.activeCueId = null;
    this.playing = false;
    this.finalized = false;
    this.classificationNoted = false;
    this.boardDegraded = false;
    this.opChain = Promise.resolve();
    if (wasPlaying) {
      mentoraProbe("conductor", "cancel", {});
    }
  }

  private async playCue(index: number) {
    const ctx = this.ctx;
    if (!this.choreo || !ctx) return;
    if (ctx.turnId !== ctx.getExpectedTurnId()) {
      this.cancel();
      return;
    }

    let cue = this.choreo.cues[index];
    if (!cue) {
      this.playing = false;
      ctx.onWaiting();
      return;
    }

    this.cueIndex = index;
    this.activeCueId = cue.cueId;
    this.transcriptBuffer = "";
    this.firedTriggers.clear();
    this.clearFallbackTimers();
    this.activeResponseId = null;

    mentoraProbe("conductor", "cue_start", {
      cueIndex: index,
      cueId: cue.cueId,
      actionsBefore: cue.actionsBefore.length,
      isLast: index >= this.choreo.cues.length - 1,
    });

    useTeachingStore.getState().patchRuntime({ phase: "applying_board" });

    let voiceScript = cue.voiceScript;
    if (cue.actionsBefore.length) {
      mentoraProbe("conductor", "actions_before_start", {
        cueId: cue.cueId,
        opCount: cue.actionsBefore.length,
      });
      const applied = await this.queueOps(
        cue.actionsBefore,
        `before:${cue.cueId}`,
      );
      mentoraProbe("conductor", "actions_before_done", {
        cueId: cue.cueId,
        ok: applied,
      });
      if (!applied) {
        this.boardDegraded = true;
        this.degradeRemainingCues(index);
        cue = this.choreo?.cues[index] ?? cue;
        voiceScript = softenFailedBoardVoice(cue.voiceScript);
      }
    } else if (this.boardDegraded) {
      voiceScript = softenFailedBoardVoice(cue.voiceScript);
    }

    if (!this.choreo || !this.ctx) return;
    if (ctx.turnId !== ctx.getExpectedTurnId()) {
      mentoraProbe("conductor", "stale_turn_abort", {
        turnId: ctx.turnId,
        expected: ctx.getExpectedTurnId(),
      });
      this.cancel();
      return;
    }

    // Classification only — understanding/step wait until choreography completes
    if (!this.classificationNoted) {
      noteClassificationEarly(this.choreo);
      this.classificationNoted = true;
    }

    const isLast = index >= this.choreo.cues.length - 1;
    const queue = ctx.getQueue();
    const boardNow = formatSemanticBoardForVoice(
      buildSemanticBoard(queue.getRegistry().list()),
    );
    const instructions = buildVoiceCueInstructions({
      studentAnswer: ctx.studentAnswer,
      voiceScript,
      semanticBoardSummary: boardNow,
      cueIndex: index,
      cueCount: this.choreo.cues.length,
      nextQuestion: isLast ? this.choreo.nextQuestion : undefined,
    });

    useTeachingStore.getState().patchRuntime({ phase: "speaking" });
    mentoraProbe("conductor", "voice_start", {
      cueId: cue.cueId,
      cueIndex: index,
      isLast,
      asksNextQuestion: Boolean(isLast && this.choreo.nextQuestion),
      nextQuestion: isLast ? this.choreo.nextQuestion : undefined,
    });
    ctx.beginVoiceTurn({
      kind: "teaching_cue",
      turnId: ctx.turnId,
      beatId: ctx.beatId,
      cueId: cue.cueId,
      instructions,
    });
  }

  private degradeRemainingCues(fromIndex: number) {
    if (!this.choreo) return;
    this.choreo = stripChoreographyBoardOps({
      ...this.choreo,
      cues: this.choreo.cues.map((c, i) =>
        i < fromIndex
          ? c
          : {
              ...c,
              actionsBefore: [],
              actionsDuring: [],
              actionsAfter: [],
              voiceScript: softenFailedBoardVoice(c.voiceScript),
            },
      ),
    });
  }

  private armFallbackTimers() {
    this.clearFallbackTimers();
    const cue = this.choreo?.cues[this.cueIndex];
    if (!cue) return;
    for (const trigger of cue.actionsDuring) {
      const ms = Math.max(200, trigger.fallbackAtMs || 800);
      const timer = setTimeout(() => {
        if (this.firedTriggers.has(trigger.triggerId)) return;
        console.info(
          "[mentora:conductor] fallbackAtMs fire",
          trigger.triggerId,
          ms,
        );
        mentoraProbe("conductor", "trigger_fallback", {
          triggerId: trigger.triggerId,
          fallbackAtMs: ms,
        });
        this.fireTrigger(trigger.triggerId, trigger.actions);
      }, ms);
      this.fallbackTimers.push(timer);
    }
  }

  private clearFallbackTimers() {
    for (const t of this.fallbackTimers) clearTimeout(t);
    this.fallbackTimers = [];
  }

  private async matchTriggers() {
    const cue = this.currentCue();
    if (!cue) return;
    for (const trigger of cue.actionsDuring) {
      if (this.firedTriggers.has(trigger.triggerId)) continue;
      if (fuzzyContains(this.transcriptBuffer, trigger.triggerPhrase)) {
        this.fireTrigger(trigger.triggerId, trigger.actions);
      }
    }
  }

  /** Mark fired synchronously, then enqueue apply to avoid CAS races. */
  private fireTrigger(triggerId: string, actions: BoardDiagramOp[]) {
    if (this.firedTriggers.has(triggerId)) return;
    this.firedTriggers.add(triggerId);
    mentoraProbe("conductor", "trigger_fire", {
      triggerId,
      actionCount: actions.length,
      cueId: this.activeCueId,
    });
    if (!actions.length) return;
    void this.queueOps(actions, `during:${triggerId}`);
  }

  private currentCue(): TeachingCue | null {
    return this.choreo?.cues[this.cueIndex] ?? null;
  }

  private queueOps(ops: BoardDiagramOp[], label: string): Promise<boolean> {
    const run = this.opChain.then(() => this.applyOps(ops, label));
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async applyOps(
    ops: BoardDiagramOp[],
    label: string,
  ): Promise<boolean> {
    const epoch = this.applyEpoch;
    const ctx = this.ctx;
    if (!ctx || !ops.length) return true;
    if (epoch !== this.applyEpoch) return false;
    const baseBoardVersion = useTeachingStore.getState().runtime.boardVersion;
    const result = await applyBeatStepOps({
      queue: ctx.getQueue(),
      boardOps: ops,
      turnId: ctx.turnId,
      expectedTurnId: ctx.getExpectedTurnId(),
      studentItemId: ctx.studentItemId,
      expectedStudentItemId: ctx.getExpectedStudentItemId(),
      baseBoardVersion,
      shouldCommit: () => epoch === this.applyEpoch && this.ctx === ctx,
    });
    if (!result.ok) {
      console.warn("[mentora:conductor] apply skipped", label, result.reason);
      mentoraProbe("conductor", "board_apply", {
        label,
        ok: false,
        reason: result.reason,
      });
      return false;
    }
    mentoraProbe("conductor", "board_apply", { label, ok: true });
    return true;
  }
}
