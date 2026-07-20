import { describe, expect, it, vi } from "vitest";
import type { LessonEvent } from "../types";
import { consumeLessonStream } from "./sse";

function lessonResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

describe("consumeLessonStream", () => {
  it("parses lesson and session events split across chunks", async () => {
    const planning: LessonEvent = { type: "planning" };
    const onEvent = vi.fn();
    const response = lessonResponse([
      `event: planning\ndata: ${JSON.stringify({
        turnId: "turn-1",
        sequence: 0,
        event: planning,
      })}\n`,
      "\n",
      'event: session\ndata: {"sessionId":"session-1","turnId":"turn-1"}\n\n',
    ]);

    const sessionId = await consumeLessonStream(
      response,
      null,
      onEvent,
      { turnId: "turn-1" },
    );

    expect(onEvent).toHaveBeenCalledWith(planning);
    expect(sessionId).toBe("session-1");
  });

  it("awaits event handlers and ignores stale turn envelopes", async () => {
    const order: string[] = [];
    const response = lessonResponse([
      `event: planning\ndata: ${JSON.stringify({
        turnId: "stale-turn",
        sequence: 0,
        event: { type: "planning" },
      })}\n\n`,
      `event: planning\ndata: ${JSON.stringify({
        turnId: "turn-1",
        sequence: 0,
        event: { type: "planning" },
      })}\n\n`,
      `event: error\ndata: ${JSON.stringify({
        turnId: "turn-1",
        sequence: 1,
        event: { type: "error", message: "done" },
      })}\n\n`,
    ]);

    await consumeLessonStream(
      response,
      null,
      async (event) => {
        order.push(`${event.type}:start`);
        await Promise.resolve();
        order.push(`${event.type}:end`);
      },
      { turnId: "turn-1" },
    );

    expect(order).toEqual([
      "planning:start",
      "planning:end",
      "error:start",
      "error:end",
    ]);
  });

  it("rejects non-success responses", async () => {
    await expect(
      consumeLessonStream(new Response(null, { status: 500 }), null, vi.fn()),
    ).rejects.toThrow("Request failed (500)");
  });

  it("cancels the stream when the turn aborts", async () => {
    const controller = new AbortController();
    const response = new Response(
      new ReadableStream({
        start() {
          // Keep the stream open until consumeLessonStream cancels its reader.
        },
      }),
      { status: 200 },
    );

    const pending = consumeLessonStream(
      response,
      null,
      vi.fn(),
      { signal: controller.signal, turnId: "turn-1" },
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
