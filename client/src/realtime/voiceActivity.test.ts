import { describe, expect, it } from "vitest";
import { isFocusOnlyBoardTool } from "./voiceActivity";

describe("isFocusOnlyBoardTool", () => {
  it("treats point_at / highlight diagram ops as focus-only", () => {
    expect(
      isFocusOnlyBoardTool(
        "board_diagram",
        JSON.stringify({
          ops: [
            { op: "point_at", objectId: "region_a2" },
            { op: "highlight", objectId: "region_ab1" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("treats create_shape as heavy (not focus-only)", () => {
    expect(
      isFocusOnlyBoardTool(
        "board_diagram",
        JSON.stringify({
          ops: [
            { op: "create_shape", objectId: "box", shape: "rectangle" },
            { op: "point_at", objectId: "box" },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("treats board_place as heavy", () => {
    expect(
      isFocusOnlyBoardTool(
        "board_place",
        JSON.stringify({ zone: "right", blocks: [{ kind: "body", text: "hi", objectId: "b1" }] }),
      ),
    ).toBe(false);
  });
});
