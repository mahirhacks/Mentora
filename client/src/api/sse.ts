import type {
  LessonEvent,
  LessonEventEnvelope,
} from "../types";

export async function consumeLessonStream(
  response: Response,
  sessionId: string | null,
  onEvent: (event: LessonEvent) => void | Promise<void>,
  options?: {
    signal?: AbortSignal;
    turnId?: string;
    onSession?: (sessionId: string) => void;
  },
): Promise<string | null> {
  if (!response.ok || !response.body) {
    throw new Error(`Request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let nextSessionId = sessionId;
  let expectedSequence = 0;

  const onAbort = () => {
    void reader.cancel("Turn aborted");
  };
  options?.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const lines = chunk.split("\n");
        let eventType = "message";
        let dataLine = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataLine = line.slice(6);
          }
        }

        if (!dataLine) {
          continue;
        }

        if (eventType === "session") {
          const payload = JSON.parse(dataLine) as {
            sessionId: string;
            turnId?: string;
          };
          if (options?.turnId && payload.turnId !== options.turnId) {
            continue;
          }
          nextSessionId = payload.sessionId;
          options?.onSession?.(payload.sessionId);
          continue;
        }

        const envelope = JSON.parse(dataLine) as LessonEventEnvelope;
        if (options?.turnId && envelope.turnId !== options.turnId) {
          continue;
        }
        if (envelope.sequence !== expectedSequence) {
          throw new Error(
            `Lesson stream sequence mismatch: expected ${expectedSequence}, received ${envelope.sequence}`,
          );
        }
        expectedSequence += 1;
        await onEvent(envelope.event);
      }
    }
  } finally {
    options?.signal?.removeEventListener("abort", onAbort);
  }

  if (options?.signal?.aborted) {
    throw new DOMException("Turn aborted", "AbortError");
  }

  return nextSessionId;
}
