import type { LessonPlan } from "./lesson.js";

/** Prevalidated square-formula lesson for Demo Safe Mode / planner fallback. */
export const fallbackSquareLesson: LessonPlan = {
  title: "Expanding (a+b)²",
  topic: "Algebra: Expanding (a+b)^2",
  prerequisites: ["area of a rectangle", "multiplying monomials"],
  misconceptions: [
    "(a+b)^2 = a^2 + b^2",
    "forgetting the middle 2ab term",
    "thinking ab and ba are different regions",
  ],
  objectives: [
    "Explain (a+b)^2 using an area model",
    "Identify the four regions a^2, ab, ab, b^2",
    "Write the identity (a+b)^2 = a^2 + 2ab + b^2",
  ],
  steps: [
    {
      id: "intro",
      title: "Intro to (a+b)^2",
      strategy: "Draw one large square and label sides a+b",
      boardPlan: [
        {
          type: "draw_rectangle",
          objectId: "big_square",
          x: 360,
          y: 100,
          width: 380,
          height: 380,
          stroke: "#164e3b",
          fill: "rgba(22,78,59,0.08)",
        },
        {
          type: "write_text",
          objectId: "label_side_h",
          x: 510,
          y: 496,
          text: "a + b",
          fontSize: 24,
          fill: "#164e3b",
        },
        {
          type: "write_text",
          objectId: "label_side_v",
          x: 300,
          y: 270,
          text: "a + b",
          fontSize: 24,
          fill: "#164e3b",
        },
      ],
      checkQuestion: "If each side is a+b, what is the area of the whole square?",
      acceptedAnswers: ["(a+b)^2", "(a+b)**2", "a+b squared", "(a + b)^2"],
      hintLadder: [
        "Area of a square is side times side.",
        "Side length is a+b, so area is (a+b) times (a+b).",
        "We write that as (a+b)^2.",
      ],
      fallbackExplanation:
        "A square with side a+b has area (a+b)^2 because area equals side times side.",
    },
    {
      id: "area_model",
      title: "Area model intuition",
      strategy: "Split the square into a and b segments and four regions",
      boardPlan: [
        {
          type: "draw_line",
          objectId: "split_v",
          points: [590, 100, 590, 480],
          stroke: "#164e3b",
          strokeWidth: 2,
        },
        {
          type: "draw_line",
          objectId: "split_h",
          points: [360, 330, 740, 330],
          stroke: "#164e3b",
          strokeWidth: 2,
        },
        {
          type: "write_equation",
          objectId: "region_a2",
          x: 440,
          y: 190,
          latex: "a^2",
          fontSize: 28,
        },
        {
          type: "write_equation",
          objectId: "region_ab1",
          x: 640,
          y: 190,
          latex: "ab",
          fontSize: 26,
          fill: "#164e3b",
        },
        {
          type: "write_equation",
          objectId: "region_ab2",
          x: 440,
          y: 380,
          latex: "ab",
          fontSize: 26,
          fill: "#164e3b",
        },
        {
          type: "write_equation",
          objectId: "region_b2",
          x: 640,
          y: 380,
          latex: "b^2",
          fontSize: 28,
          fill: "#164e3b",
        },
      ],
      checkQuestion: "What are the four region labels inside the square?",
      acceptedAnswers: ["a^2, ab, ab, b^2", "a2 ab ab b2", "a squared, ab, ab, b squared"],
      hintLadder: [
        "Look at the big square in the top-left — that is a by a.",
        "The two rectangles are both a by b.",
        "The small square is b by b.",
      ],
      fallbackExplanation:
        "The regions are a^2, ab, ab, and b^2 — algebraically those are the correct labels.",
    },
    {
      id: "combine",
      title: "Expand the terms",
      strategy: "Point at both ab regions and combine into 2ab, then write identity",
      boardPlan: [
        { type: "point_at", objectId: "region_ab1", holdMs: 2000 },
        {
          type: "highlight",
          objectId: "region_ab2",
          holdMs: 2000,
          color: "#164e3b",
        },
        {
          type: "write_equation",
          objectId: "identity",
          x: 360,
          y: 520,
          latex: "(a+b)^2 = a^2 + 2ab + b^2",
          fontSize: 28,
        },
      ],
      checkQuestion: "Why is the middle term 2ab?",
      acceptedAnswers: [
        "there are two ab regions",
        "ab + ab = 2ab",
        "two rectangles of area ab",
      ],
      hintLadder: [
        "Count how many ab rectangles you see.",
        "ab plus ab equals…?",
        "Two equal ab areas combine into 2ab.",
      ],
      fallbackExplanation:
        "There are two ab rectangles, so ab + ab = 2ab. That is why the middle term is 2ab.",
    },
    {
      id: "practice",
      title: "Practice examples",
      strategy: "Ask a transfer question with different symbols",
      boardPlan: [
        {
          type: "write_equation",
          objectId: "transfer_q",
          x: 360,
          y: 40,
          latex: "(x+y)^2 = ?",
          fontSize: 30,
        },
      ],
      checkQuestion: "Expand (x+y)^2 using the same idea.",
      acceptedAnswers: ["x^2 + 2xy + y^2", "x2 + 2xy + y2"],
      hintLadder: [
        "Same pattern as (a+b)^2.",
        "Replace a with x and b with y.",
        "It becomes x^2 + 2xy + y^2.",
      ],
      fallbackExplanation: "(x+y)^2 = x^2 + 2xy + y^2 by the same area model.",
    },
    {
      id: "challenge",
      title: "Challenge problem",
      strategy: "Final assessment",
      boardPlan: [],
      checkQuestion: "What is wrong with saying (a+b)^2 = a^2 + b^2?",
      acceptedAnswers: [
        "missing 2ab",
        "forgets the middle term",
        "ignores the two ab regions",
      ],
      hintLadder: [
        "Compare to the full identity.",
        "Which term disappeared?",
        "a^2 + b^2 is missing the 2ab from the two rectangles.",
      ],
      fallbackExplanation:
        "a^2 + b^2 forgets the two ab rectangles, so it misses 2ab.",
    },
  ],
  finalAssessment: {
    question: "Write the expanded form of (a+b)^2 and explain the middle term.",
    acceptedAnswers: [
      "a^2 + 2ab + b^2",
      "(a+b)^2 = a^2 + 2ab + b^2",
    ],
  },
  masteryCriteria: {
    minCorrectStreak: 2,
    requireFinalAssessment: true,
  },
};
