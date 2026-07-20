import { randomUUID } from "node:crypto";
import {
  TeachingSession,
  buildSystemPrompt,
} from "./teaching/session.js";
import { createBoardState } from "../tools/index.js";

const sessions = new Map<string, TeachingSession>();

export function getOrCreateSession(sessionId?: string): {
  sessionId: string;
  session: TeachingSession;
} {
  if (sessionId && sessions.has(sessionId)) {
    return { sessionId, session: sessions.get(sessionId)! };
  }

  const id = sessionId ?? randomUUID();
  const session = new TeachingSession(buildSystemPrompt(createBoardState()));
  sessions.set(id, session);
  return { sessionId: id, session };
}

export function resetSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }
  session.reset();
  session.refreshSystemPrompt();
  return true;
}

export function deleteSession(sessionId: string) {
  sessions.delete(sessionId);
}
