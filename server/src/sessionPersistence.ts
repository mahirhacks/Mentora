import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type OpenAI from "openai";
import type { BoardState } from "../tools/types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SESSIONS_DIR = resolve(here, "../../data/sessions");

export interface SessionTranscriptEntry {
  id: string;
  kind: "student" | "speak";
  text: string;
  source?: "voice" | "chat";
  speechId?: string;
}

export interface PersistedSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  boardState: BoardState;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  transcript: SessionTranscriptEntry[];
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
}

function ensureSessionsDir() {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(sessionId: string) {
  return resolve(SESSIONS_DIR, `${sessionId}.json`);
}

export function titleFromPrompt(prompt: string) {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "New lesson";
  }
  if (cleaned.length <= 56) {
    return cleaned;
  }
  const sliced = cleaned.slice(0, 53);
  const lastSpace = sliced.lastIndexOf(" ");
  const base = lastSpace > 24 ? sliced.slice(0, lastSpace) : sliced;
  return `${base}...`;
}

function previewFromText(text: string | undefined) {
  const cleaned = (text ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "Continue this lesson";
  }
  if (cleaned.length <= 64) {
    return cleaned;
  }
  const sliced = cleaned.slice(0, 61);
  const lastSpace = sliced.lastIndexOf(" ");
  const base = lastSpace > 28 ? sliced.slice(0, lastSpace) : sliced;
  return `${base}...`;
}

export { previewFromText };

export function writePersistedSession(session: PersistedSession) {
  ensureSessionsDir();
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
}

export function readPersistedSession(sessionId: string): PersistedSession | null {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as PersistedSession;
  } catch {
    return null;
  }
}

export function deletePersistedSession(sessionId: string): boolean {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) {
    return false;
  }
  unlinkSync(path);
  return true;
}

export function listPersistedSessions(): SessionSummary[] {
  ensureSessionsDir();
  const files = readdirSync(SESSIONS_DIR).filter((name) => name.endsWith(".json"));

  const summaries: SessionSummary[] = [];
  for (const file of files) {
    try {
      const session = JSON.parse(
        readFileSync(resolve(SESSIONS_DIR, file), "utf8"),
      ) as PersistedSession;
      const lastStudent = [...session.transcript]
        .reverse()
        .find((entry) => entry.kind === "student");
      summaries.push({
        id: session.id,
        title: session.title || "Untitled lesson",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        preview: previewFromText(lastStudent?.text),
      });
    } catch {
      // Skip corrupted session files.
    }
  }

  return summaries.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
