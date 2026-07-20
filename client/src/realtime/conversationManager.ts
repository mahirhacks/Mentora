/**
 * Classifies student STT vs Mentora speaker-echo and tracks Mentora speak state
 * for the turn gate.
 */

export type TranscriptClass = "student" | "echo" | "scrap";

const RECENTLY_INTERRUPTED_MS = 4000;
const DELETE_ACK_TIMEOUT_MS = 1500;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Jaccard-ish overlap on word tokens + shared-prefix heuristic for STT mangling. */
export function transcriptSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return shorter / longer;
  }

  const ta = tokens(a);
  const tb = tokens(b);

  let best = 0;
  for (const studentWord of ta) {
    if (studentWord.length < 2) continue;
    for (const mentoraWord of tb) {
      if (mentoraWord.length < 3) continue;

      // Prefix match
      let shared = 0;
      const n = Math.min(studentWord.length, mentoraWord.length);
      for (let i = 0; i < n; i++) {
        if (studentWord[i] === mentoraWord[i]) shared++;
        else break;
      }
      if (shared >= 3) {
        best = Math.max(
          best,
          shared / Math.max(studentWord.length, Math.min(mentoraWord.length, 8)),
        );
      }

      // STT mangling of a Mentora opener: short scrap, same first 2 letters
      // e.g. Alright → Alsta, Okay → Oka
      if (
        studentWord.length <= 8 &&
        mentoraWord.length >= 4 &&
        studentWord.slice(0, 2) === mentoraWord.slice(0, 2) &&
        Math.abs(studentWord.length - mentoraWord.length) <= 4
      ) {
        best = Math.max(best, 0.7);
      }

      // Tiny Levenshtein for short pairs
      if (studentWord.length <= 8 && mentoraWord.length <= 10) {
        const dist = editDistance(studentWord, mentoraWord.slice(0, studentWord.length + 2));
        const denom = Math.max(studentWord.length, mentoraWord.length);
        const score = 1 - dist / denom;
        if (score >= 0.5) best = Math.max(best, score);
      }
    }
  }
  if (best >= 0.55) return best;

  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = tmp;
    }
  }
  return dp[n]!;
}

/** Empty / punctuation-only — not a word denylist of real answers like "okay". */
export function isScrapTranscript(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const bare = t.replace(/[^\p{L}\p{N}\s']/gu, "").trim();
  return !bare;
}

export type ClassifyInput = {
  transcript: string;
  mentoraSpeaking: boolean;
  mentoraRecentlyInterrupted: boolean;
  lastMentoraTranscript: string;
};

/**
 * Echo only when Mentora was speaking / recently interrupted AND similarity is high.
 * Short answers like "okay" / "yes" stay student when Mentora is waiting.
 */
export function classifyStudentTranscript(
  input: ClassifyInput,
): TranscriptClass {
  if (isScrapTranscript(input.transcript)) return "scrap";

  const mentoraActive =
    input.mentoraSpeaking || input.mentoraRecentlyInterrupted;
  if (!mentoraActive) return "student";

  const sim = transcriptSimilarity(
    input.transcript,
    input.lastMentoraTranscript,
  );
  if (sim >= 0.55) return "echo";
  return "student";
}

export type PendingEchoDelete = {
  itemId: string;
  resumeWhenDeleted: boolean;
};

/**
 * Mutable Mentora / echo state used by TurnGate.
 */
export class ConversationManager {
  lastMentoraTranscript = "";
  mentoraSpeaking = false;
  /** Wall clock until which we treat STT as possible echo of an interrupted Mentora turn. */
  recentlyInterruptedUntil = 0;
  echoResumeAttempted = false;
  pendingDelete: PendingEchoDelete | null = null;
  private deleteAckTimer: ReturnType<typeof setTimeout> | null = null;
  /** item_ids that must not appear as YOU in the UI */
  private hiddenYouItemIds = new Set<string>();

  isMentoraRecentlyInterrupted(): boolean {
    return Date.now() < this.recentlyInterruptedUntil;
  }

  noteMentoraTranscript(text: string) {
    const t = text.trim();
    if (!t) return;
    this.lastMentoraTranscript = t;
  }

  noteMentoraSpeaking(speaking: boolean) {
    this.mentoraSpeaking = speaking;
  }

  noteMentoraInterrupted() {
    this.recentlyInterruptedUntil = Date.now() + RECENTLY_INTERRUPTED_MS;
    this.mentoraSpeaking = false;
  }

  noteMentoraResponseFinished(wasCancelled: boolean) {
    this.mentoraSpeaking = false;
    if (wasCancelled) {
      this.noteMentoraInterrupted();
    } else {
      // Clean finish — allow a future echo-resume cycle on a later turn.
      this.echoResumeAttempted = false;
      this.recentlyInterruptedUntil = 0;
    }
  }

  noteRealStudentTurn() {
    this.echoResumeAttempted = false;
  }

  hideYouItem(itemId: string) {
    if (itemId) this.hiddenYouItemIds.add(itemId);
  }

  shouldHideYouItem(itemId: string): boolean {
    return Boolean(itemId) && this.hiddenYouItemIds.has(itemId);
  }

  classify(transcript: string): TranscriptClass {
    return classifyStudentTranscript({
      transcript,
      mentoraSpeaking: this.mentoraSpeaking,
      mentoraRecentlyInterrupted: this.isMentoraRecentlyInterrupted(),
      lastMentoraTranscript: this.lastMentoraTranscript,
    });
  }

  beginEchoDelete(itemId: string, resumeWhenDeleted: boolean) {
    this.clearDeleteAckTimer();
    if (itemId) this.hideYouItem(itemId);
    this.pendingDelete = { itemId, resumeWhenDeleted };
  }

  /**
   * Called when conversation.item.deleted arrives.
   * @returns whether a one-shot resume should fire
   */
  onItemDeleted(itemId: string): boolean {
    if (!this.pendingDelete || this.pendingDelete.itemId !== itemId) {
      return false;
    }
    const shouldResume = this.pendingDelete.resumeWhenDeleted;
    this.pendingDelete = null;
    this.clearDeleteAckTimer();
    if (!shouldResume) return false;
    if (this.echoResumeAttempted) return false;
    this.echoResumeAttempted = true;
    return true;
  }

  /**
   * Start timeout waiting for item.deleted. On timeout: log, no resume, clear pending.
   */
  armDeleteAckTimeout(onTimeout: () => void) {
    this.clearDeleteAckTimer();
    this.deleteAckTimer = setTimeout(() => {
      this.deleteAckTimer = null;
      if (!this.pendingDelete) return;
      console.warn(
        "[mentora:echo] conversation.item.deleted timeout — no resume",
        this.pendingDelete.itemId,
      );
      this.pendingDelete = null;
      onTimeout();
    }, DELETE_ACK_TIMEOUT_MS);
  }

  clearDeleteAckTimer() {
    if (this.deleteAckTimer) {
      clearTimeout(this.deleteAckTimer);
      this.deleteAckTimer = null;
    }
  }

  reset() {
    this.clearDeleteAckTimer();
    this.lastMentoraTranscript = "";
    this.mentoraSpeaking = false;
    this.recentlyInterruptedUntil = 0;
    this.echoResumeAttempted = false;
    this.pendingDelete = null;
    this.hiddenYouItemIds.clear();
  }
}

export const DELETE_ACK_TIMEOUT_MS_EXPORT = DELETE_ACK_TIMEOUT_MS;
