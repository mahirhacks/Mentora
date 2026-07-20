import { describe, expect, it } from "vitest";
import { createBoardState } from "../tools/index.js";
import { buildSystemPrompt } from "../src/teaching/session.js";
import { validateTeachingScriptPayload } from "../src/teaching/teachingScript.js";

function speak(
  id: string,
  question: string | null,
  boardReferences: string[] = [],
) {
  return {
    step_type: "speak",
    speech: {
      speech_id: id,
      voice_script: question ?? "A short explanation.",
      board_references: boardReferences,
      question,
    },
  };
}

describe("validateTeachingScriptPayload", () => {
  it("accepts a valid bounded teaching script", () => {
    const result = validateTeachingScriptPayload({
      steps: [
        {
          step_type: "tool",
          tool_name: "write_text",
          tool_input: {
            id: "equation",
            text: "7 + 5 = 12",
            x: 300,
            y: 200,
          },
        },
        {
          step_type: "observe",
          text: "The equation exists.",
          board_references: ["equation"],
        },
        speak("ask_sum", "What is 7 plus 5?", ["equation"]),
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects scripts outside the step limit", () => {
    const result = validateTeachingScriptPayload({
      steps: Array.from({ length: 13 }, (_, index) =>
        speak(`speech_${index}`, index === 12 ? "Final question?" : null),
      ),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].code).toBe("step_count");
    }
  });

  it("rejects legacy unstructured speech", () => {
    const result = validateTeachingScriptPayload({
      steps: [
        { step_type: "speak", text: "Legacy speech." },
        { step_type: "speak", text: "More legacy speech." },
        { step_type: "speak", text: "Question?" },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.field === "speech")).toBe(true);
    }
  });

  it("rejects duplicate speech ids and early questions", () => {
    const result = validateTeachingScriptPayload({
      steps: [
        speak("duplicate", "An early question?"),
        speak("duplicate", null),
        speak("final", "The final question?"),
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(["duplicate", "early_question"]),
      );
    }
  });

  it("requires the final step to contain a question", () => {
    const result = validateTeachingScriptPayload({
      steps: [
        speak("intro", null),
        speak("explain", null),
        speak("finish", null),
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "final_question")).toBe(
        true,
      );
    }
  });
});

describe("production teaching prompt", () => {
  it("contains the shared adaptive teaching contract", () => {
    const prompt = buildSystemPrompt(createBoardState());

    expect(prompt).toContain("one misconception at a time");
    expect(prompt).toContain("partially correct");
    expect(prompt).toContain("No earlier speak step");
    expect(prompt).toContain("Current board state and layout catalog");
  });
});
