import { describe, expect, it } from "vitest";
import {
  coerceTeachingChoreography,
  estimateFallbackAtMs,
  flattenChoreographyOps,
  fuzzyContains,
  makeFallbackTeachingBeat,
  normalizeTranscript,
  repairChoreography,
  TeachingChoreographySchema,
} from "@mentora/shared";

describe("TeachingChoreography", () => {
  it("makeFallbackTeachingBeat is a single cue with no ops", () => {
    const beat = makeFallbackTeachingBeat({
      studentAnswer: "um",
      topic: "Python",
      checkQuestion: "What is a list?",
    });
    expect(beat.cues).toHaveLength(1);
    expect(flattenChoreographyOps(beat)).toEqual([]);
    expect(beat.nextQuestion).toContain("list");
    expect(TeachingChoreographySchema.safeParse(beat).success).toBe(true);
  });

  it("coerce wraps legacy steps into cues with actionsBefore", () => {
    const beat = coerceTeachingChoreography({
      classification: "partially_correct",
      understandingDelta: 0.05,
      steps: [
        {
          voiceScript: "Good start.",
          boardOps: [
            { op: "highlight", objectId: "big_square", holdMs: 1000 },
          ],
        },
      ],
      nextQuestion: "What next?",
      referencedBoardObjectIds: [],
      completedStepId: null,
    });
    expect(beat?.cues).toHaveLength(1);
    expect(beat?.cues[0].actionsDuring.length).toBeGreaterThanOrEqual(1);
  });

  it("coerce accepts multi-cue choreography", () => {
    const beat = coerceTeachingChoreography({
      classification: "correct_with_understanding",
      understandingDelta: 0.1,
      cues: [
        {
          cueId: "c1",
          voiceScript: "Look at the square.",
          actionsBefore: [],
          actionsDuring: [
            {
              triggerId: "t1",
              triggerPhrase: "the square",
              actions: [
                { op: "highlight", objectId: "big_square", holdMs: 1800 },
              ],
              fallbackAtMs: 900,
            },
          ],
          actionsAfter: [],
        },
        {
          cueId: "c2",
          voiceScript: "I'll split it into four regions.",
          actionsBefore: [
            {
              op: "divide_region",
              parentId: "big_square",
              layout: "2x2-grid",
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
      ],
      nextQuestion: "What is the area?",
      referencedBoardObjectIds: ["big_square"],
      completedStepId: null,
    });
    expect(beat?.cues).toHaveLength(2);
    expect(TeachingChoreographySchema.safeParse(beat).success).toBe(true);
  });

  it("moves structural ops from during into before", () => {
    const beat = coerceTeachingChoreography({
      classification: "does_not_know",
      understandingDelta: 0,
      cues: [
        {
          cueId: "bad",
          voiceScript: "I'll split the square now.",
          actionsBefore: [],
          actionsDuring: [
            {
              triggerId: "t",
              triggerPhrase: "split the square",
              actions: [
                {
                  op: "divide_region",
                  parentId: "big_square",
                  layout: "2x2-grid",
                  cells: [
                    { id: "region_a2", label: "a^2", kind: "equation" },
                    { id: "region_ab1", label: "ab", kind: "equation" },
                    { id: "region_ab2", label: "ab", kind: "equation" },
                    { id: "region_b2", label: "b^2", kind: "equation" },
                  ],
                },
                { op: "point_at", objectId: "region_a2", holdMs: 1800 },
              ],
              fallbackAtMs: 0,
            },
          ],
          actionsAfter: [],
        },
      ],
      nextQuestion: "What is the area?",
      referencedBoardObjectIds: [],
      completedStepId: null,
    });
    expect(beat).toBeTruthy();
    expect(
      beat!.cues[0].actionsBefore.some((o) => o.op === "divide_region"),
    ).toBe(true);
    expect(
      beat!.cues[0].actionsDuring.every((t) =>
        t.actions.every((a) => a.op === "point_at" || a.op === "highlight"),
      ),
    ).toBe(true);
  });

  it("repair injects visual cues when student asks for canvas help", () => {
    const bad = coerceTeachingChoreography({
      classification: "does_not_know",
      understandingDelta: 0,
      cues: [
        {
          cueId: "x",
          voiceScript:
            "I can't directly use that canvas, but imagine a big square.",
          actionsBefore: [],
          actionsDuring: [],
          actionsAfter: [],
        },
      ],
      nextQuestion: "What is the area?",
      referencedBoardObjectIds: [],
      completedStepId: null,
    });
    const fixed = repairChoreography(bad!, {
      studentAnswer: "I don't know, can you use that canvas to show me?",
      semanticBoard: [
        {
          id: "big_square",
          type: "rectangle",
          label: "square",
          author: "ai",
          relationship: "main_diagram",
        },
      ],
      topic: "Expanding (a+b)^2",
    });
    expect(flattenChoreographyOps(fixed).length).toBeGreaterThan(0);
    expect(
      fixed.cues.some((c) => /can'?t|imagine/i.test(c.voiceScript)),
    ).toBe(false);
  });

  it("repair injects divide_region for talk-only cues on undivided square", () => {
    const talkOnly = coerceTeachingChoreography({
      classification: "does_not_know",
      understandingDelta: 0.05,
      cues: [
        {
          cueId: "talk",
          voiceScript:
            "We'll start simple: think of a plus b as two numbers added.",
          actionsBefore: [],
          actionsDuring: [],
          actionsAfter: [],
        },
      ],
      nextQuestion: "What is the area of the whole square?",
      referencedBoardObjectIds: [],
      completedStepId: null,
    });
    const fixed = repairChoreography(talkOnly!, {
      studentAnswer: "No, not really.",
      semanticBoard: [
        {
          id: "big_square",
          type: "rectangle",
          label: "square",
          author: "ai",
          relationship: "main_diagram",
        },
      ],
      topic: "Expanding (a+b)^2",
    });
    expect(
      flattenChoreographyOps(fixed).some((o) => o.op === "divide_region"),
    ).toBe(true);
  });
});

describe("transcript fuzzy match + fallbackAtMs", () => {
  it("normalizes and fuzzy-contains phrases", () => {
    expect(normalizeTranscript("These two rectangles!")).toBe(
      "these two rectangles",
    );
    expect(
      fuzzyContains(
        "Notice these two rectangles on the board",
        "these two rectangles",
      ),
    ).toBe(true);
  });

  it("estimates fallback later for end-of-sentence phrases", () => {
    const script =
      "Notice these two rectangles and together they make two a b";
    const early = estimateFallbackAtMs(script, "these two rectangles");
    const late = estimateFallbackAtMs(script, "they make two a b");
    expect(late).toBeGreaterThan(early);
  });
});
