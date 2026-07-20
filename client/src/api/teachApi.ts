import type { LessonEvent } from "../types";
import { consumeLessonStream } from "./sse";

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

  return consumeLessonStream(response, sessionId, onEvent);
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
