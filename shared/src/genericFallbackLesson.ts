import type { LessonPlan } from "./lesson.js";

/** Topic-agnostic emergency plan when Terra fails for a non-square topic. */
export function makeGenericFallbackLesson(topic: string): LessonPlan {
  const clean = topic.trim() || "New topic";
  return {
    title: clean,
    topic: clean,
    prerequisites: [],
    misconceptions: [
      "assuming prior knowledge the student may not have",
      "explaining only verbally without visuals",
    ],
    objectives: [
      `Build intuition for ${clean}`,
      `Use the whiteboard to make ${clean} concrete`,
      `Check understanding with at least one question`,
    ],
    steps: [
      {
        id: "intro",
        title: `Intro to ${clean}`,
        strategy: "Title the board and ask what the student already knows",
        boardPlan: [
          {
            type: "write_text",
            objectId: "topic_title",
            x: 80,
            y: 70,
            text: clean.slice(0, 60),
            fontSize: 30,
            fill: "#164e3b",
          },
        ],
        checkQuestion: `What do you already know about ${clean}?`,
        acceptedAnswers: [
          "I don't know yet",
          "I've heard of it",
          "I know a little",
        ],
        hintLadder: [
          "Any word or idea is fine.",
          "Think of a real-world example.",
          "We'll build it together on the board.",
        ],
        fallbackExplanation: `We'll explore ${clean} step by step with drawings.`,
      },
      {
        id: "core",
        title: "Core idea",
        strategy: "Draw a simple diagram or labeled breakdown of the main idea",
        boardPlan: [],
        checkQuestion: `What is the main idea of ${clean} in one sentence?`,
        acceptedAnswers: ["the core concept", "main idea"],
        hintLadder: [
          "Look at the diagram on the board.",
          "Focus on the central relationship.",
          "I'll highlight the key part.",
        ],
        fallbackExplanation: `The core idea of ${clean} is best seen visually — let's redraw the key piece.`,
      },
      {
        id: "check",
        title: "Check understanding",
        strategy: "Ask a transfer question and point at board objects",
        boardPlan: [],
        checkQuestion: `Give a simple example related to ${clean}.`,
        acceptedAnswers: ["an example", "a case"],
        hintLadder: [
          "Use everyday life.",
          "Keep numbers or labels small.",
          "Point to the matching part on the board.",
        ],
        fallbackExplanation: `Here's a simple example of ${clean} on the board.`,
      },
      {
        id: "wrap",
        title: "Wrap-up",
        strategy: "Summarize three takeaways on the board",
        boardPlan: [],
        checkQuestion: `What are two takeaways from today's lesson on ${clean}?`,
        acceptedAnswers: ["takeaway 1", "takeaway 2"],
        hintLadder: [
          "Look at the title and diagram.",
          "Name the process or formula.",
          "Name one common mistake.",
        ],
        fallbackExplanation: `Today we built a visual understanding of ${clean}.`,
      },
    ],
    finalAssessment: {
      question: `Explain ${clean} in your own words using the board if helpful.`,
      acceptedAnswers: ["clear explanation", "partial explanation"],
    },
    masteryCriteria: {
      minCorrectStreak: 2,
      requireFinalAssessment: true,
    },
  };
}

export function isSquareFormulaTopic(topic: string): boolean {
  return /\(a\s*\+\s*b\)|a\s*\+\s*b|expanding.*square|binomial square/i.test(
    topic,
  );
}
