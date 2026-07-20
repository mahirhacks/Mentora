import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import {
  TeachingSession,
  buildSystemPrompt,
} from "../src/teaching/session.js";
import { prepareTeachingTurn } from "../src/teaching/prepareTeachingTurn.js";
import { validateTeachingScriptPayload } from "../src/teaching/teachingScript.js";
import { createBoardState } from "../tools/index.js";
import { handleStudentTurn } from "../voice/handleStudentTurn.js";
import {
  arithmeticTurn,
  fractionsTurn,
  variablesFirstTurn,
  variablesSecondTurn,
} from "./fixtures/goldenLessons.js";

const fixtures = [
  ["variables", variablesFirstTurn],
  ["fractions", fractionsTurn],
  ["arithmetic", arithmeticTurn],
] as const;

describe("golden lesson fixtures", () => {
  for (const [name, payload] of fixtures) {
    it(`${name} validates and preflights inside the safe board`, () => {
      const validation = validateTeachingScriptPayload(payload);
      expect(validation.ok).toBe(true);
      if (!validation.ok) {
        return;
      }

      const preparation = prepareTeachingTurn(
        validation.value,
        createBoardState(),
      );
      expect(preparation.ok).toBe(true);
      if (!preparation.ok) {
        return;
      }

      expect(preparation.turn.steps).toHaveLength(validation.value.length);
      expect(validation.value.at(-1)?.kind).toBe("speak");
    });
  }

  it("preserves the variable board during the adaptive second turn", () => {
    const first = validateTeachingScriptPayload(variablesFirstTurn);
    const second = validateTeachingScriptPayload(variablesSecondTurn);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    const firstPrepared = prepareTeachingTurn(
      first.value,
      createBoardState(),
    );
    expect(firstPrepared.ok).toBe(true);
    if (!firstPrepared.ok) {
      return;
    }

    const secondPrepared = prepareTeachingTurn(
      second.value,
      firstPrepared.turn.finalBoardState,
    );
    expect(secondPrepared.ok).toBe(true);
    if (!secondPrepared.ok) {
      return;
    }

    expect(
      Object.keys(secondPrepared.turn.finalBoardState.objects),
    ).toEqual(
      expect.arrayContaining([
        "variable_box",
        "age_name",
        "age_value",
        "age_expression",
        "age_result",
      ]),
    );
  });

  it("executes a mocked adaptive two-turn variable lesson", async () => {
    const first = validateTeachingScriptPayload(variablesFirstTurn);
    const second = validateTeachingScriptPayload(variablesSecondTurn);
    if (!first.ok || !second.ok) {
      throw new Error("Golden fixtures must validate.");
    }

    const session = new TeachingSession(
      buildSystemPrompt(createBoardState()),
    );
    const scripts = [first.value, second.value];

    for (const [index, script] of scripts.entries()) {
      const events = [];
      for await (const event of handleStudentTurn({
        session,
        openai: {} as OpenAI,
        plannerModel: "fake",
        turnId: `golden-turn-${index}`,
        planner: async () => ({ ok: true, value: script }),
        turn: {
          source: "chat",
          text:
            index === 0
              ? "Teach me Python variables."
              : "The value is 24.",
        },
        enableVoice: false,
      })) {
        events.push(event);
      }

      expect(events.map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "planning",
          "tool_result",
          "speech_interpreted",
          "done",
        ]),
      );
    }

    expect(session.boardState.objects.age_result).toBeDefined();
    expect(
      session.messages.some(
        (message) =>
          message.role === "user" &&
          typeof message.content === "string" &&
          message.content.includes("The value is 24."),
      ),
    ).toBe(true);
  });
});
