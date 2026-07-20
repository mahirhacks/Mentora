import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  TeachingSession,
  buildSystemPrompt,
} from "../src/teaching/session.js";
import { createBoardState } from "../tools/index.js";
import type { TeachingPlanner } from "../src/teaching/planner.js";
import type { TeachingStep } from "../src/teaching/types.js";
import { handleStudentTurn, spokenDirectiveText } from "../voice/handleStudentTurn.js";

const validScript: TeachingStep[] = [
  {
    kind: "tool",
    toolName: "write_text",
    input: {
      id: "equation",
      text: "7 + 5 = 12",
      x: 300,
      y: 200,
    },
  },
  {
    kind: "observe",
    text: "The equation exists.",
    boardObjectIds: ["equation"],
  },
  {
    kind: "speak",
    directive: {
      speechId: "ask_sum",
      voiceScript: "Seven plus five equals twelve.",
      boardObjectIds: ["equation"],
      finalQuestion: "What is seven plus five?",
    },
  },
];

function createSession() {
  return new TeachingSession(buildSystemPrompt(createBoardState()));
}

async function collectTurn(
  session: TeachingSession,
  planner: TeachingPlanner,
) {
  const events = [];
  for await (const event of handleStudentTurn({
    session,
    openai: {} as OpenAI,
    plannerModel: "fake",
    turnId: "test-turn",
    planner,
    turn: { source: "chat", text: "Teach me seven plus five." },
    enableVoice: false,
  })) {
    events.push(event);
  }
  return events;
}

describe("handleStudentTurn planning recovery", () => {
  it("repairs one invalid plan and executes the valid replacement", async () => {
    const session = createSession();
    const planner = vi
      .fn<TeachingPlanner>()
      .mockResolvedValueOnce({
        ok: false,
        issues: [
          {
            field: "steps",
            code: "step_count",
            message: "Too few steps.",
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, value: validScript });

    const events = await collectTurn(session, planner);

    expect(planner).toHaveBeenCalledTimes(2);
    expect(planner.mock.calls[1][0].validationFeedback).toContain(
      "step_count",
    );
    expect(events.at(-1)?.type).toBe("done");
    expect(
      events.find((event) => event.type === "speech_interpreted"),
    ).toMatchObject({
      naturalText:
        "Seven plus five equals twelve. What is seven plus five?",
    });
    expect(session.boardState.objects.equation).toBeDefined();
  });

  it("returns a safe spoken fallback without changing the board", async () => {
    const session = createSession();
    const initialMessageCount = session.messages.length;
    const planner = vi.fn<TeachingPlanner>().mockResolvedValue({
      ok: false,
      issues: [
        {
          field: "steps",
          code: "invalid",
          message: "Invalid script.",
        },
      ],
    });

    const events = await collectTurn(session, planner);

    expect(events.at(-1)?.type).toBe("done");
    expect(
      events.find((event) => event.type === "speech_interpreted"),
    ).toMatchObject({
      naturalText:
        "I will keep the current board clear instead of drawing over it. Should I clear the board and redraw this example?",
    });
    expect(events.some((event) => event.type === "error")).toBe(false);
    expect(session.boardState).toEqual(createBoardState());
    expect(session.messages.length).toBeGreaterThan(initialMessageCount);
  });

  it("discards an aborted planner turn without appending history", async () => {
    const session = createSession();
    const initialMessageCount = session.messages.length;
    const controller = new AbortController();
    const planner: TeachingPlanner = ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });

    const generator = handleStudentTurn({
      session,
      openai: {} as OpenAI,
      plannerModel: "fake",
      turnId: "abort-turn",
      planner,
      turn: { source: "chat", text: "Cancel this lesson." },
      enableVoice: false,
      signal: controller.signal,
    });

    expect((await generator.next()).value).toEqual({ type: "planning" });
    const pending = generator.next();
    controller.abort();

    expect((await pending).done).toBe(true);
    expect(session.messages).toHaveLength(initialMessageCount);
    expect(session.isTurnActive("abort-turn")).toBe(false);
  });
});

describe("spokenDirectiveText", () => {
  it("appends the final question when the script has none", () => {
    expect(
      spokenDirectiveText({
        speechId: "ask",
        voiceScript: "Python uses print to show a value.",
        boardObjectIds: [],
        finalQuestion: "What would print(age) show?",
      }),
    ).toBe(
      "Python uses print to show a value. What would print(age) show?",
    );
  });

  it("does not append a reworded duplicate when the script already ends with a question", () => {
    expect(
      spokenDirectiveText({
        speechId: "ask",
        voiceScript:
          "Python uses print. What would print age show?",
        boardObjectIds: [],
        finalQuestion: "What would print(age) show?",
      }),
    ).toBe("Python uses print. What would print age show?");
  });

  it("keeps a single copy when the script already contains the question", () => {
    expect(
      spokenDirectiveText({
        speechId: "ask",
        voiceScript: "Look here. What is seven plus five?",
        boardObjectIds: [],
        finalQuestion: "What is seven plus five?",
      }),
    ).toBe("Look here. What is seven plus five?");
  });
});
