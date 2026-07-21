import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { loadEnv } from "./env.js";
import {
  applySessionBoardAction,
  beginSessionTurn,
  createNamedSession,
  deleteSession,
  finishSessionTurn,
  getOrCreateSession,
  getSessionSnapshot,
  listSessions,
  rememberUserPrompt,
  resetSession,
  setSessionCanvasBackground,
  setSessionNotes,
  setSessionTranscript,
} from "./sessionStore.js";
import { summarizeConversation } from "./summarizeConversation.js";
import type { UserBoardAction } from "./userBoardActions.js";
import {
  VoiceAssistant,
  VoiceFilter,
  handleStudentTurn,
  transcribeStudentAudio,
} from "../voice/index.js";
import type {
  LessonEvent,
  LessonEventEnvelope,
} from "./teaching/types.js";

const env = loadEnv();
const openai = new OpenAI({ apiKey: env.openaiApiKey });
const voiceAssistant = new VoiceAssistant(openai, {
  model: env.realtimeModel,
  apiKey: env.openaiApiKey,
});
const voiceFilter = new VoiceFilter();

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

function sendSseEvent(
  res: ServerResponse,
  envelope: LessonEventEnvelope,
) {
  const event = envelope.event;
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(envelope)}\n\n`);
}

async function readBodyBuffer(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readBodyBuffer(req);
  return raw.length > 0 ? JSON.parse(raw.toString("utf8")) : {};
}

async function streamStudentTurn(
  req: IncomingMessage,
  res: ServerResponse,
  input: {
    sessionId?: string;
    turnId?: string;
    source: "voice" | "chat";
    text: string;
    enableVoice?: boolean;
  },
) {
  const { sessionId, session } = getOrCreateSession(input.sessionId);
  rememberUserPrompt(sessionId, input.text);
  const turnId = input.turnId ?? randomUUID();
  const controller = beginSessionTurn(sessionId, turnId);
  let sequence = 0;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const onClose = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };
  res.once("close", onClose);

  try {
    res.write("event: session\n");
    res.write(
      `data: ${JSON.stringify({ sessionId, turnId })}\n\n`,
    );

    for await (const event of handleStudentTurn({
      session,
      openai,
      plannerModel: env.plannerModel,
      turnId,
      turn: { source: input.source, text: input.text },
      voiceAssistant,
      enableVoice: input.enableVoice !== false,
      signal: controller.signal,
    })) {
      if (controller.signal.aborted || res.destroyed) {
        break;
      }
      sendSseEvent(res, {
        turnId,
        sequence,
        event,
      });
      sequence += 1;
    }

    if (!res.destroyed) {
      res.end();
    }
  } catch (error) {
    if (!controller.signal.aborted && !res.destroyed) {
      sendSseEvent(res, {
        turnId,
        sequence,
        event: {
          type: "error",
          code: "turn_failed",
          recoverable: true,
          message: error instanceof Error ? error.message : String(error),
        },
      });
      res.end();
    }
  } finally {
    res.off("close", onClose);
    finishSessionTurn(sessionId, turnId);
  }
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/voice/config") {
    sendJson(res, 200, {
      capture: voiceFilter.getCaptureConstraints(),
      browserAudio: voiceFilter.getBrowserAudioConstraints(),
      session: voiceAssistant.getSessionConfig(),
      transcriberModel: env.transcriptionModel,
      realtimeModel: env.realtimeModel,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/voice/session") {
    try {
      const session = await voiceAssistant.createClientSession();
      sendJson(res, 200, session);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/voice/transcribe") {
    try {
      const audio = await readBodyBuffer(req);
      const turn = await transcribeStudentAudio({
        openai,
        audio,
        filename: "student.webm",
        mimeType: req.headers["content-type"] ?? "audio/webm",
        transcriberModel: env.transcriptionModel,
      });

      sendJson(res, 200, turn);
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/student-turn") {
    const body = (await readJsonBody(req)) as {
      text?: string;
      source?: "voice" | "chat";
      sessionId?: string;
      turnId?: string;
      enableVoice?: boolean;
    };

    if (!body.text?.trim()) {
      sendJson(res, 400, { error: "text is required" });
      return;
    }

    await streamStudentTurn(req, res, {
      sessionId: body.sessionId,
      turnId: body.turnId,
      source: body.source ?? "chat",
      text: body.text.trim(),
      enableVoice: body.enableVoice,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teach") {
    const body = (await readJsonBody(req)) as {
      prompt?: string;
      sessionId?: string;
      turnId?: string;
      enableVoice?: boolean;
    };

    if (!body.prompt?.trim()) {
      sendJson(res, 400, { error: "prompt is required" });
      return;
    }

    await streamStudentTurn(req, res, {
      sessionId: body.sessionId,
      turnId: body.turnId,
      source: "chat",
      text: body.prompt.trim(),
      enableVoice: body.enableVoice,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/sessions") {
    sendJson(res, 200, { sessions: listSessions() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/sessions") {
    const body = (await readJsonBody(req)) as { title?: string };
    const created = createNamedSession(body.title);
    sendJson(res, 200, getSessionSnapshot(created.sessionId));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
    const sessionId = url.pathname.replace("/api/sessions/", "").split("/")[0];
    const snapshot = getSessionSnapshot(sessionId);
    if (!snapshot) {
      sendJson(res, 404, { error: "session not found" });
      return;
    }
    sendJson(res, 200, snapshot);
    return;
  }

  if (req.method === "PUT" && url.pathname.match(/^\/api\/sessions\/[^/]+\/transcript$/)) {
    const sessionId = url.pathname.split("/")[3];
    const body = (await readJsonBody(req)) as {
      transcript?: Array<{
        id: string;
        kind: "student" | "speak";
        text: string;
        source?: "voice" | "chat";
        speechId?: string;
      }>;
    };
    if (!Array.isArray(body.transcript)) {
      sendJson(res, 400, { error: "transcript array is required" });
      return;
    }
    if (!setSessionTranscript(sessionId, body.transcript)) {
      sendJson(res, 404, { error: "session not found" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "PUT" && url.pathname.match(/^\/api\/sessions\/[^/]+\/notes$/)) {
    const sessionId = url.pathname.split("/")[3];
    const body = (await readJsonBody(req)) as { notes?: unknown };
    if (typeof body.notes !== "string") {
      sendJson(res, 400, { error: "notes string is required" });
      return;
    }
    if (!setSessionNotes(sessionId, body.notes)) {
      sendJson(res, 404, { error: "session not found" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (
    req.method === "PUT" &&
    url.pathname.match(/^\/api\/sessions\/[^/]+\/canvas-background$/)
  ) {
    const sessionId = url.pathname.split("/")[3];
    const body = (await readJsonBody(req)) as { backgroundColor?: unknown };
    if (
      typeof body.backgroundColor !== "string" ||
      !/^#[0-9a-fA-F]{6}$/.test(body.backgroundColor.trim())
    ) {
      sendJson(res, 400, {
        error: "backgroundColor must be a hex color like #f7f7f8",
      });
      return;
    }
    if (
      !setSessionCanvasBackground(sessionId, body.backgroundColor.trim().toLowerCase())
    ) {
      sendJson(res, 404, { error: "session not found" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (
    req.method === "POST" &&
    url.pathname.match(/^\/api\/sessions\/[^/]+\/summarize$/)
  ) {
    const sessionId = url.pathname.split("/")[3];
    const snapshot = getSessionSnapshot(sessionId);
    if (!snapshot) {
      sendJson(res, 404, { error: "session not found" });
      return;
    }
    const body = (await readJsonBody(req).catch(() => ({}))) as {
      transcript?: Array<{
        kind?: string;
        text?: string;
      }>;
    };
    const source =
      Array.isArray(body.transcript) && body.transcript.length > 0
        ? body.transcript
        : (snapshot.transcript ?? []);
    const entries = source.filter(
      (entry): entry is { kind: "student" | "speak"; text: string } =>
        (entry.kind === "student" || entry.kind === "speak") &&
        typeof entry.text === "string" &&
        entry.text.trim().length > 0,
    );
    try {
      const result = await summarizeConversation(
        openai,
        env.plannerModel,
        entries,
      );
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Failed to summarize conversation",
      });
    }
    return;
  }

  if (
    req.method === "POST" &&
    url.pathname.match(/^\/api\/sessions\/[^/]+\/board-actions$/)
  ) {
    const sessionId = url.pathname.split("/")[3];
    const body = (await readJsonBody(req)) as {
      action?: UserBoardAction;
    };
    if (!body.action || typeof body.action.type !== "string") {
      sendJson(res, 400, { error: "board action is required" });
      return;
    }
    try {
      const boardState = applySessionBoardAction(sessionId, body.action);
      if (!boardState) {
        sendJson(res, 404, { error: "session not found" });
        return;
      }
      sendJson(res, 200, { boardState });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/sessions/")) {
    const sessionId = url.pathname.replace("/api/sessions/", "");
    deleteSession(sessionId);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    const body = (await readJsonBody(req)) as { sessionId?: string };
    if (!body.sessionId || !resetSession(body.sessionId)) {
      sendJson(res, 404, { error: "session not found" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/session/")) {
    const sessionId = url.pathname.replace("/api/session/", "");
    const snapshot = getSessionSnapshot(sessionId) ?? (() => {
      const created = getOrCreateSession(sessionId);
      return getSessionSnapshot(created.sessionId);
    })();
    sendJson(res, 200, {
      sessionId,
      boardState: snapshot?.boardState,
      title: snapshot?.title,
      transcript: snapshot?.transcript ?? [],
    });
    return;
  }

  sendJson(res, 404, { error: "not found" });
}
