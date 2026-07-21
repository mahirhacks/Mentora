import type {
  BoardState,
  TranscriptEntry,
  UserBoardAction,
} from "../types";

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
}

export interface SessionSnapshot {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  boardState: BoardState;
  transcript: TranscriptEntry[];
  notes?: string;
}

export async function listLearningSessions(): Promise<SessionSummary[]> {
  const response = await fetch("/api/sessions");
  if (!response.ok) {
    throw new Error("Failed to load lessons");
  }
  const payload = (await response.json()) as { sessions: SessionSummary[] };
  return payload.sessions;
}

export async function createLearningSession(
  title?: string,
): Promise<SessionSnapshot> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error("Failed to create lesson");
  }
  return response.json() as Promise<SessionSnapshot>;
}

export async function fetchLearningSession(
  sessionId: string,
): Promise<SessionSnapshot> {
  const response = await fetch(`/api/sessions/${sessionId}`);
  if (!response.ok) {
    throw new Error("Failed to open lesson");
  }
  return response.json() as Promise<SessionSnapshot>;
}

export async function deleteLearningSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete lesson");
  }
}

export async function syncSessionTranscript(
  sessionId: string,
  transcript: TranscriptEntry[],
): Promise<void> {
  const response = await fetch(`/api/sessions/${sessionId}/transcript`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript: transcript
        .filter((entry) => entry.kind === "student" || entry.kind === "speak")
        .map((entry) => {
          if (entry.kind === "student") {
            return {
              id: entry.id,
              kind: entry.kind,
              text: entry.text,
              source: entry.source,
            };
          }
          return {
            id: entry.id,
            kind: entry.kind,
            text: entry.text,
            speechId: entry.speechId,
          };
        }),
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to save lesson transcript");
  }
}

export async function syncSessionNotes(
  sessionId: string,
  notes: string,
): Promise<void> {
  const response = await fetch(`/api/sessions/${sessionId}/notes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (!response.ok) {
    throw new Error("Failed to save lesson notes");
  }
}

export async function syncSessionCanvasBackground(
  sessionId: string,
  backgroundColor: string,
): Promise<void> {
  const response = await fetch(
    `/api/sessions/${sessionId}/canvas-background`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backgroundColor }),
    },
  );
  if (!response.ok) {
    throw new Error("Failed to save canvas background");
  }
}

export async function summarizeSessionConversation(
  sessionId: string,
  transcript: TranscriptEntry[],
): Promise<{ topic: string; summary: string }> {
  const response = await fetch(`/api/sessions/${sessionId}/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript: transcript
        .filter((entry) => entry.kind === "student" || entry.kind === "speak")
        .map((entry) => ({
          kind: entry.kind,
          text: entry.text,
        })),
    }),
  });
  const payload = (await response.json()) as {
    topic?: string;
    summary?: string;
    error?: string;
  };
  if (!response.ok || !payload.topic || !payload.summary) {
    throw new Error(payload.error ?? "Failed to summarize conversation");
  }
  return { topic: payload.topic, summary: payload.summary };
}

export async function applyUserBoardAction(
  sessionId: string,
  action: UserBoardAction,
): Promise<BoardState> {
  const response = await fetch(
    `/api/sessions/${sessionId}/board-actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
  const payload = (await response.json()) as {
    boardState?: BoardState;
    error?: string;
  };
  if (!response.ok || !payload.boardState) {
    throw new Error(payload.error ?? "Failed to update the board");
  }
  return payload.boardState;
}
