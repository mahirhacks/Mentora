import type { LessonEvent } from "../types";

export async function streamLesson(
  prompt: string,
  sessionId: string | null,
  onEvent: (event: LessonEvent) => void,
): Promise<string | null> {
  const response = await fetch("/api/teach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, sessionId }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Teach request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let nextSessionId = sessionId;

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
        const payload = JSON.parse(dataLine) as { sessionId: string };
        nextSessionId = payload.sessionId;
        continue;
      }

      const event = JSON.parse(dataLine) as LessonEvent;
      onEvent(event);
    }
  }

  return nextSessionId;
}

export async function resetLesson(sessionId: string) {
  const response = await fetch("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    throw new Error("Failed to reset session");
  }
}
