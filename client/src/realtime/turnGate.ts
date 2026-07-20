import {
  makeFallbackTeachingBeat,
  repairChoreography,
  type TeachingChoreography,
} from "@mentora/shared";
import type { BoardActionQueue } from "../board/ActionQueue";
import { buildSemanticBoard } from "../board/semanticBoard";
import { decideTeachingBeat } from "../api/lessonApi";
import { TeachingConductor } from "../teaching/TeachingConductor";
import type { RealtimeClient } from "./RealtimeClient";
import { useTeachingStore } from "../state/teachingStore";
import { useLessonUiStore } from "../state/lessonUiStore";
import { ConversationManager } from "./conversationManager";
import { mentoraProbe } from "../testing/mentoraTestProbe";

/** semantic_vad: barge-in when waiting; Mentora replies only via explicit response.create */
export const VAD_BASE = {
  type: "semantic_vad" as const,
  eagerness: "medium" as const,
  create_response: false,
  interrupt_response: true,
};

export const INPUT_AUDIO_TRANSCRIPTION = {
  model: "gpt-4o-mini-transcribe",
};

const REPLY_DEBOUNCE_MS = 300;
const DECIDE_TIMEOUT_MS = 6000;

export const ECHO_RESUME_INSTRUCTIONS = `
Your previous spoken turn was interrupted by microphone echo, not by a real student answer.
Continue briefly from where you left off. Do not re-welcome.
Ask one clear check question out loud, then stop and wait.
Do not call tools.
`.trim();

export type TurnGateDeps = {
  getQueue: () => BoardActionQueue;
};

type ActiveVoice = {
  responseId: string | null;
  turnId: number;
  beatId: string;
  cueId: string;
  kind: "teaching_cue" | "lesson_opening" | "echo_resume";
};

/**
 * Student transcript → Decision choreography → TeachingConductor (sync board to speech).
 */
export class TurnGate {
  private studentSpeaking = false;
  private replyRequested = false;
  private responseLive = false;
  private replyTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressMentoraTranscript = false;
  private wasCancelled = false;
  private turnId = 0;
  private activeStudentItemId = "";
  private pendingStudentAnswer = "";
  private activeVoice: ActiveVoice | null = null;
  private decideInFlight = false;
  readonly conversation = new ConversationManager();
  readonly conductor = new TeachingConductor();

  constructor(
    private client: RealtimeClient,
    private deps: TurnGateDeps,
  ) {
    setActiveTurnGate(this);
  }

  isStudentSpeaking() {
    return this.studentSpeaking;
  }

  isResponseLive() {
    return this.responseLive;
  }

  shouldSuppressMentoraTranscript() {
    return this.suppressMentoraTranscript || this.studentSpeaking;
  }

  shouldHideYouItem(itemId: string) {
    return this.conversation.shouldHideYouItem(itemId);
  }

  getTurnId() {
    return this.turnId;
  }

  lock() {
    this.replyRequested = false;
    this.clearReplyTimer();
    this.suppressMentoraTranscript = false;
    this.ensureVadNoAutoReply();
    this.setInterruptResponse(true);
  }

  unlock() {
    this.ensureVadNoAutoReply();
  }

  onSpeechStarted() {
    this.studentSpeaking = true;
    this.suppressMentoraTranscript = true;
    this.clearReplyTimer();
    if (this.responseLive) {
      this.wasCancelled = true;
      this.conversation.noteMentoraInterrupted();
    }
  }

  onSpeechStopped() {
    this.studentSpeaking = false;
  }

  onTranscriptionCompleted(transcript: string, itemId: string) {
    this.studentSpeaking = false;
    const kind = this.conversation.classify(transcript);

    if (kind === "scrap") {
      console.info("[mentora:gate] scrap transcript — delete/hide", transcript);
      this.handleNonStudentItem(itemId, false);
      return;
    }

    if (kind === "echo") {
      console.info("[mentora:gate] echo transcript — delete", transcript);
      const resume =
        this.conversation.isMentoraRecentlyInterrupted() &&
        !this.conversation.echoResumeAttempted;
      this.handleNonStudentItem(itemId, resume);
      return;
    }

    this.conversation.noteRealStudentTurn();
    this.pendingStudentAnswer = transcript.trim();
    this.activeStudentItemId = itemId;
    mentoraProbe("gate", "student_turn", {
      itemId,
      answerPreview: transcript.trim().slice(0, 80),
    });
    if (this.conductor.isPlaying()) {
      this.conductor.cancel();
      this.turnId += 1;
      mentoraProbe("gate", "interrupt_playing", { turnId: this.turnId });
    }
    this.scheduleStudentReply();
  }

  onItemDeleted(itemId: string) {
    const shouldResume = this.conversation.onItemDeleted(itemId);
    if (!shouldResume) return;
    this.conductor.cancel();
    useTeachingStore.getState().patchRuntime({ phase: "waiting_for_student" });
    this.lock();
    const beatId = crypto.randomUUID();
    this.beginVoiceTurn({
      kind: "echo_resume",
      turnId: this.turnId,
      beatId,
      cueId: "echo_resume",
      instructions: ECHO_RESUME_INSTRUCTIONS,
    });
  }

  onMentoraTranscript(text: string) {
    this.conversation.noteMentoraTranscript(text);
  }

  /** Live Mentora speech transcript — Conductor gesture sync (filter by response_id). */
  onMentoraTranscriptDelta(delta: string, responseId: string) {
    this.conductor.onTranscriptDelta(delta, responseId);
  }

  onResponseCreated(event: Record<string, unknown>) {
    this.responseLive = true;
    this.replyRequested = true;
    this.wasCancelled = false;
    this.conversation.noteMentoraSpeaking(true);
    this.suppressMentoraTranscript = false;
    this.clearReplyTimer();
    // Keep interrupt_response true so students can barge in while Mentora speaks.

    const response = event.response as
      | { id?: string; metadata?: Record<string, unknown> }
      | undefined;
    const id = String(response?.id ?? event.response_id ?? "");
    const meta = response?.metadata ?? {};
    const active = this.activeVoice;
    if (!active || !id) return;

    const metaOk =
      String(meta.kind ?? "") === active.kind &&
      String(meta.turnId ?? "") === String(active.turnId) &&
      String(meta.beatId ?? "") === active.beatId &&
      (active.kind !== "teaching_cue" ||
        String(meta.cueId ?? "") === active.cueId);

    if (!metaOk) {
      console.warn("[mentora:gate] ignore response.created — metadata mismatch");
      return;
    }

    active.responseId = id;
    mentoraProbe("gate", "response_created", {
      responseId: id,
      kind: active.kind,
      turnId: active.turnId,
      cueId: active.cueId,
    });
    if (active.kind === "teaching_cue" && this.conductor.isPlaying()) {
      this.conductor.onResponseCreated(id);
    }
  }

  onResponseFinished(event: Record<string, unknown>, cancelled: boolean) {
    this.responseLive = false;
    if (!this.conversation.pendingDelete) {
      this.replyRequested = false;
    }
    this.conversation.noteMentoraSpeaking(false);
    this.conversation.noteMentoraResponseFinished(
      cancelled || this.wasCancelled,
    );
    this.wasCancelled = false;
    this.setInterruptResponse(true);

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
    const active = this.activeVoice;

    if (active?.kind === "teaching_cue") {
      void this.conductor.onResponseFinished(event).then((result) => {
        mentoraProbe("gate", "teaching_response_finished", {
          result,
          responseId: id,
          status,
        });
        // "advanced" already called beginVoiceTurn for the next cue — keep that activeVoice.
        if (result === "finished" || result === "cancelled") {
          this.activeVoice = null;
        }
      });
      return;
    }

    const completedOk =
      status === "completed" &&
      active &&
      id === active.responseId &&
      String(meta.kind ?? "") === active.kind &&
      String(meta.turnId ?? "") === String(active.turnId) &&
      String(meta.beatId ?? "") === active.beatId;

    if (completedOk) {
      this.activeVoice = null;
      useTeachingStore.getState().patchRuntime({
        phase: "waiting_for_student",
        wasInterrupted: false,
      });
      this.lock();
      mentoraProbe("gate", "waiting_for_student", {
        via: "non_teaching_voice",
        kind: active.kind,
        turnId: active.turnId,
      });
      console.info("[mentora:gate] voice completed → waiting_for_student", {
        kind: active.kind,
        turnId: active.turnId,
      });
      return;
    }

    if (active && id === active.responseId) {
      mentoraProbe("gate", "non_completed_voice_done", {
        status,
        responseId: id,
      });
      console.info("[mentora:gate] ignore non-completed voice done", status);
      this.activeVoice = null;
    }
  }

  shouldCancelWhileWaiting(): boolean {
    const phase = useTeachingStore.getState().runtime.phase;
    if (phase !== "waiting_for_student") return false;
    if (this.studentSpeaking) return false;
    if (this.replyRequested) return false;
    if (this.responseLive) return false;
    if (this.replyTimer) return false;
    if (this.conversation.pendingDelete) return false;
    if (this.decideInFlight) return false;
    if (this.conductor.isPlaying()) return false;
    return true;
  }

  requestReplyAfterInjectedStudentInput(text: string) {
    this.studentSpeaking = false;
    this.conversation.noteRealStudentTurn();
    this.suppressMentoraTranscript = false;
    this.clearReplyTimer();
    this.pendingStudentAnswer = text.trim();
    this.activeStudentItemId = `chat_${crypto.randomUUID()}`;
    void this.runDecideThenVoice();
  }

  beginVoiceTurn(input: {
    kind: ActiveVoice["kind"];
    turnId: number;
    beatId: string;
    cueId?: string;
    instructions: string;
  }) {
    const cueId = input.cueId ?? input.beatId;
    this.activeVoice = {
      responseId: null,
      turnId: input.turnId,
      beatId: input.beatId,
      cueId,
      kind: input.kind,
    };
    useTeachingStore.getState().patchRuntime({ phase: "speaking" });
    this.replyRequested = true;
    mentoraProbe("gate", "response_create", {
      kind: input.kind,
      turnId: input.turnId,
      beatId: input.beatId,
      cueId,
      asksNextQuestion:
        input.kind === "teaching_cue" &&
        /ask exactly this question/i.test(input.instructions),
    });
    this.client.sendEvent({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        tool_choice: "none",
        metadata: {
          kind: input.kind,
          turnId: String(input.turnId),
          beatId: input.beatId,
          cueId,
        },
        instructions: input.instructions,
      },
    });
  }

  private handleNonStudentItem(itemId: string, resumeWhenDeleted: boolean) {
    this.clearReplyTimer();
    this.replyRequested = false;
    this.suppressMentoraTranscript = false;
    if (!itemId) {
      useTeachingStore.getState().patchRuntime({
        phase: "waiting_for_student",
      });
      this.lock();
      return;
    }
    this.conversation.beginEchoDelete(itemId, resumeWhenDeleted);
    this.client.deleteConversationItem(itemId);
    this.conversation.armDeleteAckTimeout(() => {
      useTeachingStore.getState().patchRuntime({
        phase: "waiting_for_student",
      });
      this.lock();
    });
    if (!resumeWhenDeleted) {
      useTeachingStore.getState().patchRuntime({
        phase: "waiting_for_student",
      });
      this.lock();
    }
  }

  private clearReplyTimer() {
    if (this.replyTimer) {
      clearTimeout(this.replyTimer);
      this.replyTimer = null;
    }
  }

  private scheduleStudentReply() {
    if (this.decideInFlight) return;
    this.clearReplyTimer();
    this.replyTimer = setTimeout(() => {
      this.replyTimer = null;
      if (this.studentSpeaking) return;
      if (this.decideInFlight) return;
      void this.runDecideThenVoice();
    }, REPLY_DEBOUNCE_MS);
  }

  private async runDecideThenVoice() {
    const studentAnswer = this.pendingStudentAnswer.trim();
    if (!studentAnswer) return;
    if (this.decideInFlight) return;

    this.conductor.cancel();
    if (this.responseLive) {
      try {
        this.client.sendEvent({ type: "response.cancel" });
      } catch {
        // ignore
      }
    }

    this.turnId += 1;
    const turnId = this.turnId;
    const beatId = crypto.randomUUID();
    const studentItemId = this.activeStudentItemId;

    this.decideInFlight = true;
    this.replyRequested = true;
    mentoraProbe("gate", "decide_start", {
      turnId,
      studentItemId,
      answerPreview: studentAnswer.slice(0, 80),
    });
    useTeachingStore.getState().patchRuntime({
      phase: "evaluating",
      wasInterrupted: true,
    });
    useTeachingStore.getState().patchRuntime({ phase: "deciding" });

    const teaching = useTeachingStore.getState();
    const plan = teaching.plan;
    const step = plan.steps[teaching.runtime.currentStepIndex];
    const queue = this.deps.getQueue();
    const semanticBoard = buildSemanticBoard(queue.getRegistry().list());

    const recentHistory = useLessonUiStore
      .getState()
      .transcript.slice(-6)
      .map((l) => ({
        role: l.role as "you" | "mentora" | "system",
        text: l.text.slice(0, 400),
      }));

    let choreo: TeachingChoreography;
    try {
      const result = await decideTeachingBeat(
        {
          topic: teaching.topicRequest || plan.topic,
          studentAnswer,
          currentStepIndex: teaching.runtime.currentStepIndex,
          planTitle: plan.title,
          stepTitle: step?.title,
          checkQuestion: step?.checkQuestion,
          acceptedAnswers: step?.acceptedAnswers,
          fallbackExplanation: step?.fallbackExplanation,
          semanticBoard,
          recentHistory,
        },
        DECIDE_TIMEOUT_MS,
      );
      choreo = result.beat;
      console.info(
        "[mentora:decide]",
        result.source,
        choreo.classification,
        `${choreo.cues.length} cues`,
      );
    } catch (err) {
      console.warn("[mentora:decide] timeout/fail → fallback", err);
      choreo = makeFallbackTeachingBeat({
        studentAnswer,
        topic: teaching.topicRequest || plan.topic,
        checkQuestion: step?.checkQuestion,
        fallbackExplanation: step?.fallbackExplanation,
      });
    }

    choreo = repairChoreography(choreo, {
      studentAnswer,
      semanticBoard,
      topic: teaching.topicRequest || plan.topic,
      checkQuestion: step?.checkQuestion,
    });

    if (turnId !== this.turnId || studentItemId !== this.activeStudentItemId) {
      console.info("[mentora:decide] stale turn — discard", turnId);
      mentoraProbe("gate", "decide_stale_discard", {
        turnId,
        currentTurnId: this.turnId,
        studentItemId,
        currentStudentItemId: this.activeStudentItemId,
      });
      this.decideInFlight = false;
      this.replyRequested = false;
      if (
        this.pendingStudentAnswer.trim() &&
        this.activeStudentItemId &&
        this.activeStudentItemId !== studentItemId
      ) {
        this.scheduleStudentReply();
      }
      return;
    }

    this.decideInFlight = false;
    mentoraProbe("gate", "decide_play", {
      turnId,
      cueCount: choreo.cues.length,
      classification: choreo.classification,
    });
    await this.conductor.play(choreo, {
      turnId,
      beatId,
      studentItemId,
      studentAnswer,
      getQueue: this.deps.getQueue,
      getExpectedTurnId: () => this.turnId,
      getExpectedStudentItemId: () => this.activeStudentItemId,
      client: this.client,
      beginVoiceTurn: (input) => this.beginVoiceTurn(input),
      onWaiting: () => {
        useTeachingStore.getState().patchRuntime({
          phase: "waiting_for_student",
          wasInterrupted: false,
        });
        this.lock();
        mentoraProbe("gate", "waiting_for_student", {
          via: "choreography_done",
          turnId,
        });
        console.info("[mentora:gate] choreography done → waiting_for_student", {
          turnId,
        });
      },
    });
  }

  private ensureVadNoAutoReply() {
    this.client.updateSession({
      audio: {
        input: {
          transcription: INPUT_AUDIO_TRANSCRIPTION,
          turn_detection: { ...VAD_BASE },
        },
      },
    });
  }

  private setInterruptResponse(interrupt_response: boolean) {
    this.client.updateSession({
      audio: {
        input: {
          transcription: INPUT_AUDIO_TRANSCRIPTION,
          turn_detection: {
            ...VAD_BASE,
            interrupt_response,
          },
        },
      },
    });
  }
}

export function lockTurnForStudent(client: RealtimeClient) {
  client.updateSession({
    audio: {
      input: {
        transcription: INPUT_AUDIO_TRANSCRIPTION,
        turn_detection: { ...VAD_BASE },
      },
    },
  });
}

export function unlockTurnAfterStudent(client: RealtimeClient) {
  lockTurnForStudent(client);
}

let activeTurnGate: TurnGate | null = null;

export function setActiveTurnGate(gate: TurnGate | null) {
  activeTurnGate = gate;
}

export function getActiveTurnGate() {
  return activeTurnGate;
}
