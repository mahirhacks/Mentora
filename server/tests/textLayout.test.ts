import { describe, expect, it } from "vitest";
import {
  layoutTextWords,
  normalizeMarkedText,
  parseMarkedRows,
} from "../tools/textLayout.js";

describe("marked text parsing", () => {
  it("parses JSON-safe {s}/{n}/{t} marks", () => {
    expect(
      parseMarkedRows(
        "Hi!{s}This{s}will{s}be{s}the{s}new{n}programming{s}class",
      ),
    ).toEqual([
      { indentSpaces: 0, tokens: ["Hi!", "This", "will", "be", "the", "new"] },
      { indentSpaces: 0, tokens: ["programming", "class"] },
    ]);
  });

  it("treats leading {t}/{s} as indentation and never keeps literal \\t text", () => {
    expect(parseMarkedRows("{t}name{s}:={s}\"Go\"")).toEqual([
      { indentSpaces: 2, tokens: ["name", ":=", '"Go"'] },
    ]);
    expect(parseMarkedRows("\\tname{s}:={s}1")).toEqual([
      { indentSpaces: 2, tokens: ["name", ":=", "1"] },
    ]);
  });

  it("still accepts legacy \\s\\n marks when they survive as two chars", () => {
    expect(parseMarkedRows("package\\smain")).toEqual([
      { indentSpaces: 0, tokens: ["package", "main"] },
    ]);
  });

  it("normalizes marks back to readable text", () => {
    expect(
      normalizeMarkedText("package{s}main{n}{t}var{s}age{s}int{s}={s}24"),
    ).toBe("package main\n  var age int = 24");
  });
});

describe("layoutTextWords", () => {
  it("places marked words with a visible space gap", () => {
    const layout = layoutTextWords({
      groupId: "code",
      text: "package{s}main",
      x: 40,
      y: 40,
      fontSize: 16,
    });

    expect(layout.words.map((word) => word.text)).toEqual(["package", "main"]);
    const gap =
      layout.words[1].bounds.x -
      (layout.words[0].bounds.x + layout.words[0].bounds.width);
    expect(gap).toBeGreaterThanOrEqual(5);
    expect(layout.fullText).toBe("package main");
  });

  it("indents code with {t} without drawing \\t", () => {
    const layout = layoutTextWords({
      groupId: "code",
      text: "package{s}main{n}{t}name{s}:={s}1",
      x: 40,
      y: 40,
      fontSize: 16,
    });

    const packageWord = layout.words.find((word) => word.text === "package");
    const nameWord = layout.words.find((word) => word.text === "name");
    expect(packageWord).toBeDefined();
    expect(nameWord).toBeDefined();
    expect(nameWord!.bounds.x).toBeGreaterThan(packageWord!.bounds.x);
    expect(layout.words.some((word) => word.text.includes("\\t"))).toBe(false);
  });
});
