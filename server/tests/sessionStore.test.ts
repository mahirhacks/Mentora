import { describe, expect, it } from "vitest";
import {
  applySessionBoardAction,
  beginSessionTurn,
  cancelSessionTurn,
  deleteSession,
  getOrCreateSession,
} from "../src/sessionStore.js";

describe("session-scoped cancellation", () => {
  it("cancels only the active turn for the selected session", () => {
    const sessionA = "session-a";
    const sessionB = "session-b";
    getOrCreateSession(sessionA);
    getOrCreateSession(sessionB);

    const controllerA = beginSessionTurn(sessionA, "turn-a");
    const controllerB = beginSessionTurn(sessionB, "turn-b");

    expect(cancelSessionTurn(sessionA)).toBe(true);
    expect(controllerA.signal.aborted).toBe(true);
    expect(controllerB.signal.aborted).toBe(false);

    deleteSession(sessionA);
    deleteSession(sessionB);
  });

  it("superseding a session turn aborts the prior controller", () => {
    const sessionId = "session-supersede";
    getOrCreateSession(sessionId);

    const first = beginSessionTurn(sessionId, "first");
    const second = beginSessionTurn(sessionId, "second");

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    deleteSession(sessionId);
  });

  it("treats a user board edit as a turn interruption", () => {
    const sessionId = "session-board-barge-in";
    getOrCreateSession(sessionId);
    const controller = beginSessionTurn(sessionId, "active-turn");

    const boardState = applySessionBoardAction(sessionId, {
      type: "shape",
      shape: "rectangle",
      from: { x: 180, y: 160 },
      to: { x: 340, y: 280 },
    });

    expect(controller.signal.aborted).toBe(true);
    expect(boardState).not.toBeNull();
    expect(
      Object.values(boardState?.objects ?? {}).some(
        (object) => object.createdBy === "user",
      ),
    ).toBe(true);

    deleteSession(sessionId);
  });
});
