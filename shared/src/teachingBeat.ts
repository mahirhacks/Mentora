import { z } from "zod";
import { BoardDiagramOpSchema, type BoardDiagramOp } from "./diagramLayout.js";
import { StudentResponseClassificationSchema } from "./lesson.js";

/** Compact board object for the decision model (no pixels). */
export const SemanticBoardObjectSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(32),
  label: z.string().max(120).default(""),
  author: z.enum(["ai", "student"]),
  relationship: z.string().max(80).default(""),
});

export type SemanticBoardObject = z.infer<typeof SemanticBoardObjectSchema>;

const STRUCTURAL_OPS = new Set([
  "create_shape",
  "divide_region",
  "label_in",
  "place_relative",
  "pause",
]);
const GESTURE_OPS = new Set(["point_at", "highlight"]);

export const TeachingCueTriggerSchema = z.object({
  triggerId: z.string().min(1).max(64),
  triggerPhrase: z.string().min(1).max(160),
  actions: z.array(BoardDiagramOpSchema).max(6).default([]),
  /** Estimated ms from cue voice start — phrase position, not a universal delay. */
  fallbackAtMs: z.number().int().nonnegative().max(12000).default(0),
});

export type TeachingCueTrigger = z.infer<typeof TeachingCueTriggerSchema>;

export const TeachingCueSchema = z.object({
  cueId: z.string().min(1).max(64),
  /** One short sentence; target ~2–5s spoken. */
  voiceScript: z.string().min(1).max(280),
  actionsBefore: z.array(BoardDiagramOpSchema).max(10).default([]),
  actionsDuring: z.array(TeachingCueTriggerSchema).max(6).default([]),
  actionsAfter: z.array(BoardDiagramOpSchema).max(8).default([]),
});

export type TeachingCue = z.infer<typeof TeachingCueSchema>;

/**
 * Decision-model choreography for one student answer.
 * Realtime speaks cue voiceScripts; Conductor syncs board to transcript.
 */
export const TeachingChoreographySchema = z.object({
  classification: StudentResponseClassificationSchema,
  understandingDelta: z.number().min(-0.25).max(0.25),
  cues: z.array(TeachingCueSchema).min(1).max(6),
  nextQuestion: z.string().min(1).max(280),
  referencedBoardObjectIds: z
    .array(z.string().min(1).max(64))
    .max(12)
    .default([]),
  completedStepId: z.string().max(64).nullable().optional(),
});

export type TeachingChoreography = z.infer<typeof TeachingChoreographySchema>;

/** @deprecated Alias — prefer TeachingChoreography. */
export type TeachingBeat = TeachingChoreography;
/** @deprecated Alias — prefer TeachingChoreographySchema. */
export const TeachingBeatSchema = TeachingChoreographySchema;

export const DecideRequestSchema = z.object({
  topic: z.string().min(1),
  studentAnswer: z.string().min(1).max(1000),
  currentStepIndex: z.number().int().nonnegative(),
  planTitle: z.string().optional(),
  stepTitle: z.string().optional(),
  checkQuestion: z.string().optional(),
  acceptedAnswers: z.array(z.string()).optional(),
  fallbackExplanation: z.string().optional(),
  semanticBoard: z.array(SemanticBoardObjectSchema).max(80).default([]),
  recentHistory: z
    .array(
      z.object({
        role: z.enum(["you", "mentora", "system"]),
        text: z.string().max(500),
      }),
    )
    .max(8)
    .default([]),
});

export type DecideRequest = z.infer<typeof DecideRequestSchema>;

export function isStructuralOp(op: BoardDiagramOp): boolean {
  return STRUCTURAL_OPS.has(op.op);
}

export function isGestureOp(op: BoardDiagramOp): boolean {
  return GESTURE_OPS.has(op.op);
}

/** Normalize transcript / trigger phrases for fuzzy contains. */
export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/won't/g, "will not")
    .replace(/can't/g, "cannot")
    .replace(/n't/g, " not")
    .replace(/'re/g, " are")
    .replace(/'ll/g, " will")
    .replace(/'ve/g, " have")
    .replace(/'m/g, " am")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fuzzyContains(haystack: string, needle: string): boolean {
  const h = normalizeTranscript(haystack);
  const n = normalizeTranscript(needle);
  if (!n) return false;
  if (h.includes(n)) return true;
  // Token overlap fallback for slight paraphrase
  const hTokens = new Set(h.split(" ").filter(Boolean));
  const nTokens = n.split(" ").filter(Boolean);
  if (nTokens.length === 0) return false;
  const hit = nTokens.filter((t) => hTokens.has(t)).length;
  return hit / nTokens.length >= 0.85 && nTokens.length >= 2;
}

export function wordCount(text: string): number {
  return normalizeTranscript(text).split(" ").filter(Boolean).length;
}

export function estimatedSpeechDurationMs(script: string): number {
  const words = wordCount(script);
  return Math.min(5500, Math.max(1800, words * 420));
}

/**
 * Estimate fallbackAtMs from phrase position within the cue script.
 * fallbackAtMs = (wordsBefore / totalWords) * duration + 250
 */
export function estimateFallbackAtMs(
  voiceScript: string,
  triggerPhrase: string,
): number {
  const script = normalizeTranscript(voiceScript);
  const phrase = normalizeTranscript(triggerPhrase);
  const total = wordCount(voiceScript);
  const duration = estimatedSpeechDurationMs(voiceScript);
  if (!phrase || total === 0) return Math.min(duration, 800) + 250;

  const idx = script.indexOf(phrase);
  let wordsBefore = 0;
  if (idx >= 0) {
    wordsBefore = script.slice(0, idx).split(" ").filter(Boolean).length;
  } else {
    // Phrase not found — put fallback near mid-cue
    wordsBefore = Math.floor(total * 0.45);
  }
  return Math.round((wordsBefore / Math.max(total, 1)) * duration + 250);
}

function withDefaultHold(op: BoardDiagramOp): BoardDiagramOp {
  if (op.op === "point_at" || op.op === "highlight") {
    return { ...op, holdMs: op.holdMs && op.holdMs > 0 ? op.holdMs : 1800 };
  }
  return op;
}

/** Move structural ops out of during → before; keep only gestures during. */
export function enforceStructuralGestureSplit(cue: TeachingCue): TeachingCue {
  const before = [...cue.actionsBefore];
  const after = [...cue.actionsAfter];
  const during: TeachingCueTrigger[] = [];

  for (const trigger of cue.actionsDuring) {
    const gestures: BoardDiagramOp[] = [];
    for (const op of trigger.actions) {
      if (isGestureOp(op)) {
        gestures.push(withDefaultHold(op));
      } else if (isStructuralOp(op)) {
        before.push(op);
      }
    }
    if (gestures.length > 0 || trigger.triggerPhrase) {
      during.push({
        ...trigger,
        actions: gestures,
        fallbackAtMs:
          trigger.fallbackAtMs > 0
            ? trigger.fallbackAtMs
            : estimateFallbackAtMs(cue.voiceScript, trigger.triggerPhrase),
      });
    }
  }

  // Structural misplaced in after stays in after; gestures in before → during synthetic
  const cleanBefore = before.filter((op) => {
    if (isGestureOp(op)) return false;
    return true;
  });
  const orphanGestures = before.filter(isGestureOp).map(withDefaultHold);
  if (orphanGestures.length) {
    during.unshift({
      triggerId: `${cue.cueId}_early_gesture`,
      triggerPhrase: cue.voiceScript.slice(0, 40) || cue.voiceScript,
      actions: orphanGestures,
      fallbackAtMs: estimateFallbackAtMs(
        cue.voiceScript,
        cue.voiceScript.slice(0, 40) || cue.voiceScript,
      ),
    });
  }

  return {
    ...cue,
    actionsBefore: cleanBefore,
    actionsDuring: during.filter((t) => t.actions.length > 0),
    actionsAfter: after.map((op) =>
      isGestureOp(op) ? withDefaultHold(op) : op,
    ),
  };
}

export function fillMissingFallbackAtMs(cue: TeachingCue): TeachingCue {
  return {
    ...cue,
    actionsDuring: cue.actionsDuring.map((t) => ({
      ...t,
      fallbackAtMs:
        t.fallbackAtMs > 0
          ? t.fallbackAtMs
          : estimateFallbackAtMs(cue.voiceScript, t.triggerPhrase),
    })),
  };
}

export function normalizeChoreography(
  choreo: TeachingChoreography,
): TeachingChoreography {
  return {
    ...choreo,
    cues: choreo.cues.map((c) =>
      fillMissingFallbackAtMs(enforceStructuralGestureSplit(c)),
    ),
  };
}

export function flattenChoreographyOps(
  choreo: TeachingChoreography,
): BoardDiagramOp[] {
  return choreo.cues.flatMap((c) => [
    ...c.actionsBefore,
    ...c.actionsDuring.flatMap((t) => t.actions),
    ...c.actionsAfter,
  ]);
}

export function hasStructuralBoardOps(choreo: TeachingChoreography): boolean {
  return flattenChoreographyOps(choreo).some(isStructuralOp);
}

/** True when the area-model square exists but has not been divided yet. */
export function boardNeedsAreaSplit(board: SemanticBoardObject[]): boolean {
  return Boolean(findMainSquareId(board)) && !boardHasRegions(board);
}

/** @deprecated Prefer flattenChoreographyOps */
export function flattenBeatBoardOps(
  beat: TeachingChoreography,
): BoardDiagramOp[] {
  return flattenChoreographyOps(beat);
}

export function flattenChoreographyVoice(choreo: TeachingChoreography): string {
  return choreo.cues.map((c) => c.voiceScript).join(" ");
}

/** Soften: strip all board ops after CAS failure (keep voice). */
export function stripChoreographyBoardOps(
  choreo: TeachingChoreography,
): TeachingChoreography {
  const hadOps = flattenChoreographyOps(choreo).length > 0;
  return {
    ...choreo,
    cues: choreo.cues.map((c, i) => ({
      cueId: c.cueId,
      voiceScript:
        i === 0 && hadOps
          ? `${c.voiceScript} We'll keep using what's already on the board.`
          : c.voiceScript,
      actionsBefore: [],
      actionsDuring: [],
      actionsAfter: [],
    })),
    referencedBoardObjectIds: [],
  };
}

/** @deprecated Prefer stripChoreographyBoardOps */
export function stripBeatBoardOps(
  beat: TeachingChoreography,
): TeachingChoreography {
  return stripChoreographyBoardOps(beat);
}

function sanitizeOp(raw: unknown): BoardDiagramOp | null {
  if (!raw || typeof raw !== "object") return null;
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v !== null && v !== undefined) o[k] = v;
  }
  // Map alternate names from decide / examples
  if (typeof o.targetId === "string" && !o.objectId) {
    o.objectId = o.targetId;
  }
  if (o.op === "circle" && Array.isArray(o.targetIds)) {
    return null;
  }
  if (o.op === "write_equation") {
    o.op = "place_relative";
    if (!o.where) o.where = "below";
    if (!o.targetId && !o.objectId) o.targetId = "big_square";
    if (!o.objectId) o.objectId = `eq_${Math.random().toString(36).slice(2, 8)}`;
  }
  const parsed = BoardDiagramOpSchema.safeParse(o);
  return parsed.success ? parsed.data : null;
}

export function sanitizeOpsList(raw: unknown): BoardDiagramOp[] {
  if (!Array.isArray(raw)) return [];
  const out: BoardDiagramOp[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (o.op === "circle" && Array.isArray(o.targetIds)) {
        for (const id of o.targetIds) {
          if (typeof id === "string") {
            out.push({ op: "highlight", objectId: id, holdMs: 1800 });
          }
        }
        continue;
      }
    }
    const op = sanitizeOp(item);
    if (op) out.push(op);
  }
  return out;
}

function cueFromLegacyStep(
  step: Record<string, unknown>,
  index: number,
): TeachingCue | null {
  const voice =
    typeof step.voiceScript === "string" ? step.voiceScript.trim() : "";
  if (!voice) return null;
  const boardOps = sanitizeOpsList(step.boardOps ?? step.actionsBefore);
  const duringRaw = Array.isArray(step.actionsDuring) ? step.actionsDuring : [];
  const during: TeachingCueTrigger[] = [];
  for (let i = 0; i < duringRaw.length; i++) {
    const t = duringRaw[i];
    if (!t || typeof t !== "object") continue;
    const tr = t as Record<string, unknown>;
    const phrase = String(tr.triggerPhrase ?? "").trim();
    if (!phrase) continue;
    during.push({
      triggerId: String(tr.triggerId ?? `t${index}_${i}`),
      triggerPhrase: phrase.slice(0, 160),
      actions: sanitizeOpsList(tr.actions),
      fallbackAtMs:
        typeof tr.fallbackAtMs === "number" && tr.fallbackAtMs > 0
          ? Math.floor(tr.fallbackAtMs)
          : 0,
    });
  }

  return {
    cueId: String(step.cueId ?? `cue_${index + 1}`),
    voiceScript: voice.slice(0, 280),
    actionsBefore: sanitizeOpsList(
      step.actionsBefore ?? (during.length ? [] : boardOps),
    ),
    actionsDuring: during,
    actionsAfter: sanitizeOpsList(step.actionsAfter),
  };
}

/**
 * Coerce API JSON into TeachingChoreography.
 * Accepts cues[], legacy steps[], or flat voiceScript+boardOps.
 */
export function coerceTeachingChoreography(
  raw: unknown,
): TeachingChoreography | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  let cues: TeachingCue[] = [];

  if (Array.isArray(obj.cues) && obj.cues.length > 0) {
    for (let i = 0; i < obj.cues.length; i++) {
      const c = obj.cues[i];
      if (!c || typeof c !== "object") continue;
      const cue = cueFromLegacyStep(c as Record<string, unknown>, i);
      if (cue) cues.push(cue);
    }
  } else if (Array.isArray(obj.steps) && obj.steps.length > 0) {
    for (let i = 0; i < obj.steps.length; i++) {
      const s = obj.steps[i];
      if (!s || typeof s !== "object") continue;
      const step = s as Record<string, unknown>;
      const cue = cueFromLegacyStep(
        {
          ...step,
          actionsBefore: step.boardOps ?? step.actionsBefore,
        },
        i,
      );
      if (cue) cues.push(cue);
    }
  } else if (typeof obj.voiceScript === "string" && obj.voiceScript.trim()) {
    const cue = cueFromLegacyStep(
      {
        voiceScript: obj.voiceScript,
        boardOps: obj.boardOps,
        actionsBefore: obj.actionsBefore,
        actionsDuring: obj.actionsDuring,
        actionsAfter: obj.actionsAfter,
        cueId: "cue_1",
      },
      0,
    );
    if (cue) cues = [cue];
  }

  if (!cues.length) return null;

  const parsed = TeachingChoreographySchema.safeParse({
    classification: obj.classification,
    understandingDelta: obj.understandingDelta,
    cues,
    nextQuestion: obj.nextQuestion,
    referencedBoardObjectIds: obj.referencedBoardObjectIds ?? [],
    completedStepId: obj.completedStepId ?? null,
  });
  if (!parsed.success) return null;
  return normalizeChoreography(parsed.data);
}

/** @deprecated Prefer coerceTeachingChoreography */
export function coerceTeachingBeat(
  raw: unknown,
): TeachingChoreography | null {
  return coerceTeachingChoreography(raw);
}

export function makeFallbackTeachingBeat(input: {
  studentAnswer: string;
  checkQuestion?: string;
  fallbackExplanation?: string;
  topic?: string;
}): TeachingChoreography {
  const topic = input.topic?.trim() || "this topic";
  const next =
    input.checkQuestion?.trim() ||
    `What is one thing you understand so far about ${topic}?`;
  const explain =
    input.fallbackExplanation?.trim() ||
    `Thanks for sharing. Let's keep going on ${topic} step by step.`;
  return normalizeChoreography({
    classification: "unclear_audio",
    understandingDelta: 0,
    cues: [
      {
        cueId: "fallback_1",
        voiceScript: explain.slice(0, 280),
        actionsBefore: [],
        actionsDuring: [],
        actionsAfter: [],
      },
    ],
    nextQuestion: next,
    referencedBoardObjectIds: [],
    completedStepId: null,
  });
}

export function studentWantsVisual(answer: string): boolean {
  return /\b(visual|visually|canvas|whiteboard|board|draw|show me|diagram|picture|sketch|illustrat|on the (board|canvas))\b/i.test(
    answer,
  );
}

export function voiceDeniesCanvas(text: string): boolean {
  return (
    /\b(can'?t|cannot|unable|don'?t|do not)\b[\s\S]{0,48}\b(canvas|board|draw|diagram|whiteboard)\b/i.test(
      text,
    ) ||
    /\b(can'?t|cannot)\s+directly\b/i.test(text) ||
    /\bimagine\b[\s\S]{0,30}\b(square|diagram|board)\b/i.test(text)
  );
}

export function scrubCanvasDenial(text: string): string {
  let t = text
    .replace(
      /[^.!?]*\b(can'?t|cannot|unable)\b[^.!?]*\b(canvas|board|draw|diagram|whiteboard)[^.!?]*[.!?]?/gi,
      "",
    )
    .replace(
      /[^.!?]*\bimagine\b[^.!?]*\b(square|diagram|board)[^.!?]*[.!?]?/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!t) t = "Look at the board with me.";
  return t.slice(0, 280);
}

/** Soften a cue script when the matching board draw failed. */
export function softenFailedBoardVoice(script: string): string {
  const cleaned = script
    .replace(
      /\b(I('ll| will)|Let's|Let us)\s+(split|draw|divide|write|sketch|label)[^.!?]*[.!?]?/gi,
      "",
    )
    .replace(
      /\b(just divided|I just (drew|split|divided)|look at the (new|split|four)[^.!]*)[.!?]?/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) {
    return "Let's keep going with what's already on the board.";
  }
  return `We'll keep using what's already on the board. ${cleaned}`.slice(
    0,
    280,
  );
}


function findMainSquareId(board: SemanticBoardObject[]): string | null {
  const byId = board.find((o) => /square|big_square/i.test(o.id));
  if (byId) return byId.id;
  const rect = board.find(
    (o) =>
      o.author === "ai" &&
      (o.type === "rectangle" ||
        /square/i.test(o.label) ||
        /square/i.test(o.id)),
  );
  return rect?.id ?? null;
}

function boardHasRegions(board: SemanticBoardObject[]): boolean {
  return board.some(
    (o) => /^region_/i.test(o.id) || /a\^?2|b\^?2|\bab\b/i.test(o.label),
  );
}

/** Deterministic visual rescue choreography (atomic cues). */
export function buildAreaModelVisualChoreography(
  board: SemanticBoardObject[],
): TeachingCue[] {
  const parentId = findMainSquareId(board) ?? "big_square";

  if (boardHasRegions(board)) {
    const a2 =
      board.find((o) => o.id === "region_a2")?.id ??
      board.find((o) => /a\^?2|a²/i.test(o.label))?.id;
    const ab1 =
      board.find((o) => o.id === "region_ab1")?.id ??
      board.find((o) => /\bab\b/i.test(o.label))?.id;
    const ab2 = board.find((o) => o.id === "region_ab2")?.id;
    const cues: TeachingCue[] = [
      {
        cueId: "vis_intro",
        voiceScript: "Look at the board — the square is already split.",
        actionsBefore: [],
        actionsDuring: [
          {
            triggerId: "vis_intro_hl",
            triggerPhrase: "already split",
            actions: [{ op: "highlight", objectId: parentId, holdMs: 1800 }],
            fallbackAtMs: 0,
          },
        ],
        actionsAfter: [],
      },
    ];
    if (a2) {
      cues.push({
        cueId: "vis_a2",
        voiceScript: "This region is a squared.",
        actionsBefore: [],
        actionsDuring: [
          {
            triggerId: "vis_a2_pt",
            triggerPhrase: "a squared",
            actions: [{ op: "point_at", objectId: a2, holdMs: 1800 }],
            fallbackAtMs: 0,
          },
        ],
        actionsAfter: [],
      });
    }
    if (ab1) {
      cues.push({
        cueId: "vis_ab",
        voiceScript: "These rectangles are each a times b.",
        actionsBefore: [],
        actionsDuring: [
          {
            triggerId: "vis_ab_hl",
            triggerPhrase: "each a times b",
            actions: [
              { op: "highlight", objectId: ab1, holdMs: 1800 },
              ...(ab2
                ? [{ op: "highlight" as const, objectId: ab2, holdMs: 1800 }]
                : []),
            ],
            fallbackAtMs: 0,
          },
        ],
        actionsAfter: [],
      });
    }
    return cues;
  }

  return [
    {
      cueId: "vis_square",
      voiceScript: "Look at our square with sides a plus b.",
      actionsBefore: [],
      actionsDuring: [
        {
          triggerId: "vis_sq_hl",
          triggerPhrase: "our square",
          actions: [{ op: "highlight", objectId: parentId, holdMs: 1800 }],
          fallbackAtMs: 0,
        },
      ],
      actionsAfter: [],
    },
    {
      cueId: "vis_split",
      voiceScript: "I'll split it into four regions using a and b.",
      actionsBefore: [
        {
          op: "divide_region",
          parentId,
          layout: "2x2-grid",
          colRatios: [0.605, 0.395],
          rowRatios: [0.605, 0.395],
          drawGuides: true,
          cells: [
            { id: "region_a2", label: "a^2", kind: "equation" },
            { id: "region_ab1", label: "ab", kind: "equation" },
            { id: "region_ab2", label: "ab", kind: "equation" },
            { id: "region_b2", label: "b^2", kind: "equation" },
          ],
        },
      ],
      actionsDuring: [],
      actionsAfter: [],
    },
    {
      cueId: "vis_a2",
      voiceScript: "Top-left is a squared.",
      actionsBefore: [],
      actionsDuring: [
        {
          triggerId: "vis_a2_pt",
          triggerPhrase: "a squared",
          actions: [{ op: "point_at", objectId: "region_a2", holdMs: 1800 }],
          fallbackAtMs: 0,
        },
      ],
      actionsAfter: [],
    },
    {
      cueId: "vis_ab",
      voiceScript: "These two side rectangles are each a times b.",
      actionsBefore: [],
      actionsDuring: [
        {
          triggerId: "vis_ab_both",
          triggerPhrase: "two side rectangles",
          actions: [
            { op: "highlight", objectId: "region_ab1", holdMs: 1800 },
            { op: "highlight", objectId: "region_ab2", holdMs: 1800 },
          ],
          fallbackAtMs: 0,
        },
      ],
      actionsAfter: [],
    },
  ];
}

/** @deprecated Prefer buildAreaModelVisualChoreography */
export function buildAreaModelVisualSteps(board: SemanticBoardObject[]) {
  return buildAreaModelVisualChoreography(board).map((c) => ({
    voiceScript: c.voiceScript,
    boardOps: [
      ...c.actionsBefore,
      ...c.actionsDuring.flatMap((t) => t.actions),
      ...c.actionsAfter,
    ],
  }));
}

export function repairChoreography(
  choreo: TeachingChoreography,
  input: {
    studentAnswer: string;
    semanticBoard: SemanticBoardObject[];
    topic?: string;
    checkQuestion?: string;
  },
): TeachingChoreography {
  let scrubbed: TeachingChoreography = {
    ...choreo,
    cues: choreo.cues.map((c) => ({
      ...c,
      voiceScript: voiceDeniesCanvas(c.voiceScript)
        ? scrubCanvasDenial(c.voiceScript)
        : c.voiceScript,
    })),
  };
  scrubbed = normalizeChoreography(scrubbed);

  const wantsVisual = studentWantsVisual(input.studentAnswer);
  const hadDenial = choreo.cues.some((c) => voiceDeniesCanvas(c.voiceScript));
  const noOps = flattenChoreographyOps(scrubbed).length === 0;
  const noStructural = !hasStructuralBoardOps(scrubbed);
  const topicLooksSquare = /\(a\s*\+\s*b\)|a\+b|binomial|expand/i.test(
    `${input.topic ?? ""} ${input.checkQuestion ?? ""}`,
  );
  const hasSquare = Boolean(findMainSquareId(input.semanticBoard));
  const needsSplit = boardNeedsAreaSplit(input.semanticBoard);

  // Decision often returns talk-only cues. For the (a+b)² board, if the square
  // is still undivided and there are no structural ops, inject the visual plan.
  if ((topicLooksSquare || hasSquare) && needsSplit && noStructural) {
    return normalizeChoreography({
      ...scrubbed,
      classification:
        scrubbed.classification === "unclear_audio"
          ? "does_not_know"
          : scrubbed.classification,
      cues: buildAreaModelVisualChoreography(input.semanticBoard),
      nextQuestion: scrubbed.nextQuestion.includes("?")
        ? scrubbed.nextQuestion
        : "Looking at the four regions, what is the total area of the whole square?",
      referencedBoardObjectIds: [
        findMainSquareId(input.semanticBoard) ?? "big_square",
        "region_a2",
        "region_ab1",
      ],
    });
  }

  if ((wantsVisual || hadDenial) && noOps && (topicLooksSquare || hasSquare)) {
    return normalizeChoreography({
      ...scrubbed,
      classification:
        scrubbed.classification === "unclear_audio"
          ? "does_not_know"
          : scrubbed.classification,
      cues: buildAreaModelVisualChoreography(input.semanticBoard),
      nextQuestion:
        scrubbed.nextQuestion.includes("area") ||
        scrubbed.nextQuestion.includes("?")
          ? scrubbed.nextQuestion
          : "Looking at the four regions, what is the total area of the whole square?",
      referencedBoardObjectIds: [
        findMainSquareId(input.semanticBoard) ?? "big_square",
        "region_a2",
        "region_ab1",
      ],
    });
  }

  return scrubbed;
}

/** @deprecated Prefer repairChoreography */
export function repairTeachingBeat(
  beat: TeachingChoreography,
  input: {
    studentAnswer: string;
    semanticBoard: SemanticBoardObject[];
    topic?: string;
    checkQuestion?: string;
  },
): TeachingChoreography {
  return repairChoreography(beat, input);
}
