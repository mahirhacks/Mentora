import type { TeachingChoreography } from "@mentora/shared";

/** Deterministic two-cue choreography with structural before + gesture during. */
export function fixtureTwoCueChoreography(
  overrides?: Partial<TeachingChoreography>,
): TeachingChoreography {
  return {
    classification: "correct_with_understanding",
    understandingDelta: 0.1,
    nextQuestion: "What is one side length of the square?",
    referencedBoardObjectIds: ["sq1"],
    completedStepId: null,
    cues: [
      {
        cueId: "cue_draw",
        voiceScript: "I am drawing a square on the board right now.",
        actionsBefore: [
          {
            op: "create_shape",
            objectId: "sq1",
            shape: "rectangle",
            region: "center",
            label: "Square",
          },
        ],
        actionsDuring: [
          {
            triggerId: "point_square",
            triggerPhrase: "drawing a square",
            fallbackAtMs: 400,
            actions: [{ op: "point_at", objectId: "sq1", holdMs: 500 }],
          },
        ],
        actionsAfter: [],
      },
      {
        cueId: "cue_ask",
        voiceScript: "Look at that square with me for a moment.",
        actionsBefore: [],
        actionsDuring: [],
        actionsAfter: [],
      },
    ],
    ...overrides,
  };
}

export function fixtureSingleCueNoBoard(): TeachingChoreography {
  return {
    classification: "partially_correct",
    understandingDelta: 0.05,
    nextQuestion: "Can you say that again in your own words?",
    referencedBoardObjectIds: [],
    completedStepId: null,
    cues: [
      {
        cueId: "cue_only",
        voiceScript: "Thanks — let's keep going step by step.",
        actionsBefore: [],
        actionsDuring: [],
        actionsAfter: [],
      },
    ],
  };
}
