import { describe, expect, it } from "vitest";
import { normalizeTopic } from "./normalizeTopic.js";

describe("normalizeTopic", () => {
  it("strips teach-me wrappers", () => {
    expect(normalizeTopic("Teach me Python")).toBe("Python");
    expect(normalizeTopic("teach me about fractions")).toBe("Fractions");
    expect(normalizeTopic("Teach me: algebra")).toBe("Algebra");
  });

  it("strips other conversational asks", () => {
    expect(normalizeTopic("can you explain photosynthesis")).toBe(
      "Photosynthesis",
    );
    expect(normalizeTopic("I want to learn Newton's laws")).toBe(
      "Newton's laws",
    );
    expect(normalizeTopic("help me understand derivatives")).toBe(
      "Derivatives",
    );
  });

  it("leaves real subjects alone", () => {
    expect(normalizeTopic("Expanding (a+b)² with an area model")).toBe(
      "Expanding (a+b)² with an area model",
    );
    expect(normalizeTopic("Pythagorean theorem visually")).toBe(
      "Pythagorean theorem visually",
    );
  });
});
