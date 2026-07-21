import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import {
  TeachingSession,
  buildSystemPrompt,
} from "./teaching/session.js";
import { createBoardState } from "../tools/index.js";
import type { BoardState } from "../tools/types.js";
import { assertBoardPostconditions } from "../tools/postconditions.js";
import {
  applyUserBoardAction as applyUserActionToState,
  type UserBoardAction,
} from "./userBoardActions.js";
import {
  deletePersistedSession,
  listPersistedSessions,
  previewFromText,
  readPersistedSession,
  titleFromPrompt,
  writePersistedSession,
  type PersistedSession,
  type SessionSummary,
  type SessionTranscriptEntry,
} from "./sessionPersistence.js";
import { hasListableTranscript } from "./summarizeConversation.js";

interface SessionRecord {
  session: TeachingSession;
  title: string;
  createdAt: string;
  updatedAt: string;
  transcript: SessionTranscriptEntry[];
  notes: string;
  plannerTitle: boolean;
}

const sessions = new Map<string, SessionRecord>();
const activeTurns = new Map<
  string,
  { turnId: string; controller: AbortController }
>();

function createRecord(title = "New lesson"): SessionRecord {
  const now = new Date().toISOString();
  return {
    session: new TeachingSession(buildSystemPrompt(createBoardState())),
    title,
    createdAt: now,
    updatedAt: now,
    transcript: [],
    notes: "",
    plannerTitle: false,
  };
}

function hydrateRecord(persisted: PersistedSession): SessionRecord {
  const session = new TeachingSession(buildSystemPrompt(createBoardState()));
  session.boardState = structuredClone(persisted.boardState) as BoardState;
  session.messages.length = 0;
  session.messages.push(
    ...(structuredClone(persisted.messages) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
  );
  if (session.messages[0]?.role !== "system") {
    session.messages.unshift({
      role: "system",
      content: buildSystemPrompt(session.boardState),
    });
  } else {
    session.refreshSystemPrompt();
  }

  return {
    session,
    title: persisted.title || "Untitled lesson",
    createdAt: persisted.createdAt,
    updatedAt: persisted.updatedAt,
    transcript: persisted.transcript ?? [],
    notes: persisted.notes ?? "",
    plannerTitle: Boolean(persisted.plannerTitle),
  };
}

function toPersisted(sessionId: string, record: SessionRecord): PersistedSession {
  return {
    id: sessionId,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    boardState: structuredClone(record.session.boardState),
    messages: structuredClone(record.session.messages),
    transcript: structuredClone(record.transcript),
    notes: record.notes ?? "",
    plannerTitle: record.plannerTitle,
  };
}

export function persistSession(sessionId: string) {
  const record = sessions.get(sessionId);
  if (!record) {
    return;
  }
  record.updatedAt = new Date().toISOString();
  writePersistedSession(toPersisted(sessionId, record));
}

export function createNamedSession(title?: string): {
  sessionId: string;
  session: TeachingSession;
} {
  // Always allocate a brand-new isolated lesson memory (messages, board,
  // transcript, notes). Never reuse another session's TeachingSession object.
  const id = randomUUID();
  const record = createRecord(title?.trim() || "New lesson");
  sessions.set(id, record);
  persistSession(id);
  return { sessionId: id, session: record.session };
}

export function getOrCreateSession(sessionId?: string): {
  sessionId: string;
  session: TeachingSession;
} {
  const requestedId = sessionId?.trim();

  if (requestedId && sessions.has(requestedId)) {
    return {
      sessionId: requestedId,
      session: sessions.get(requestedId)!.session,
    };
  }

  if (requestedId) {
    const persisted = readPersistedSession(requestedId);
    if (persisted) {
      const record = hydrateRecord(persisted);
      sessions.set(requestedId, record);
      return { sessionId: requestedId, session: record.session };
    }
  }

  // No usable session id → fresh memory. Ignore empty/blank ids.
  const id = randomUUID();
  const record = createRecord();
  sessions.set(id, record);
  persistSession(id);
  return { sessionId: id, session: record.session };
}

export function listSessions(): SessionSummary[] {
  const disk = listPersistedSessions();
  const diskIds = new Set(disk.map((entry) => entry.id));

  for (const [id, record] of sessions.entries()) {
    if (diskIds.has(id)) {
      continue;
    }
    if (!hasListableTranscript(record.transcript)) {
      continue;
    }
    disk.push({
      id,
      title: record.title,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      preview: previewFromText(
        [...record.transcript].reverse().find((entry) => entry.kind === "student")
          ?.text,
      ),
    });
  }

  return disk.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getSessionSnapshot(sessionId: string): PersistedSession | null {
  const live = sessions.get(sessionId);
  if (live) {
    return toPersisted(sessionId, live);
  }
  return readPersistedSession(sessionId);
}

export function rememberUserPrompt(sessionId: string, prompt: string) {
  const record = sessions.get(sessionId);
  if (!record || record.plannerTitle) {
    return;
  }
  if (record.title === "New lesson" || record.title === "Untitled lesson") {
    record.title = titleFromPrompt(prompt);
  }
}

export function setSessionTranscript(
  sessionId: string,
  transcript: SessionTranscriptEntry[],
): { ok: boolean; needsLessonTopic: boolean } {
  const { sessionId: id } = getOrCreateSession(sessionId);
  const record = sessions.get(id);
  if (!record) {
    return { ok: false, needsLessonTopic: false };
  }
  record.transcript = structuredClone(transcript);
  persistSession(id);
  const needsLessonTopic =
    !record.plannerTitle && hasListableTranscript(record.transcript);
  return { ok: true, needsLessonTopic };
}

export function setSessionPlannerTitle(sessionId: string, title: string) {
  const record = sessions.get(sessionId) ?? (() => {
    const persisted = readPersistedSession(sessionId);
    if (!persisted) {
      return null;
    }
    const hydrated = hydrateRecord(persisted);
    sessions.set(sessionId, hydrated);
    return hydrated;
  })();
  if (!record) {
    return false;
  }
  const cleaned = title.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return false;
  }
  record.title = cleaned;
  record.plannerTitle = true;
  persistSession(sessionId);
  return true;
}

export function getSessionTranscriptForTopic(
  sessionId: string,
): SessionTranscriptEntry[] | null {
  const live = sessions.get(sessionId);
  if (live) {
    return live.transcript;
  }
  return readPersistedSession(sessionId)?.transcript ?? null;
}

export function setSessionNotes(sessionId: string, notes: string) {
  const { sessionId: id } = getOrCreateSession(sessionId);
  const record = sessions.get(id);
  if (!record) {
    return false;
  }
  record.notes = notes;
  persistSession(id);
  return true;
}

export function setSessionCanvasBackground(
  sessionId: string,
  backgroundColor: string,
) {
  const { sessionId: id } = getOrCreateSession(sessionId);
  const record = sessions.get(id);
  if (!record) {
    return false;
  }
  record.session.boardState.backgroundColor = backgroundColor;
  record.session.refreshSystemPrompt();
  persistSession(id);
  return true;
}

export function applySessionBoardAction(
  sessionId: string,
  action: UserBoardAction,
): BoardState | null {
  if (activeTurns.has(sessionId)) {
    cancelSessionTurn(sessionId);
  }
  const { sessionId: id } = getOrCreateSession(sessionId);
  const record = sessions.get(id);
  if (!record) {
    return null;
  }

  const nextState = applyUserActionToState(
    record.session.boardState,
    action,
  );
  const postconditions = assertBoardPostconditions(nextState);
  if (!postconditions.ok) {
    throw new Error(postconditions.error);
  }
  record.session.boardState = nextState;
  record.session.refreshSystemPrompt();
  persistSession(id);
  return structuredClone(record.session.boardState);
}

export function resetSession(sessionId: string): boolean {
  const session = sessions.get(sessionId)?.session ?? getOrCreateSession(sessionId).session;
  const record = sessions.get(sessionId);
  if (!record) {
    return false;
  }
  cancelSessionTurn(sessionId);
  session.reset();
  session.refreshSystemPrompt();
  record.transcript = [];
  record.notes = "";
  record.title = "New lesson";
  record.plannerTitle = false;
  persistSession(sessionId);
  return true;
}

export function deleteSession(sessionId: string) {
  cancelSessionTurn(sessionId);
  sessions.delete(sessionId);
  deletePersistedSession(sessionId);
}

export function beginSessionTurn(
  sessionId: string,
  turnId: string,
): AbortController {
  cancelSessionTurn(sessionId);
  const controller = new AbortController();
  activeTurns.set(sessionId, { turnId, controller });
  sessions.get(sessionId)?.session.beginTurn(turnId);
  return controller;
}

export function finishSessionTurn(sessionId: string, turnId: string) {
  const active = activeTurns.get(sessionId);
  if (active?.turnId === turnId) {
    activeTurns.delete(sessionId);
  }
  sessions.get(sessionId)?.session.finishTurn(turnId);
  persistSession(sessionId);
}

export function cancelSessionTurn(sessionId: string): boolean {
  const active = activeTurns.get(sessionId);
  if (!active) {
    return false;
  }
  active.controller.abort();
  activeTurns.delete(sessionId);
  sessions.get(sessionId)?.session.finishTurn(active.turnId);
  return true;
}

// Warm the in-memory map from disk so list/get work immediately.
for (const summary of listPersistedSessions()) {
  if (!sessions.has(summary.id)) {
    const persisted = readPersistedSession(summary.id);
    if (persisted) {
      sessions.set(summary.id, hydrateRecord(persisted));
    }
  }
}
