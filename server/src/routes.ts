import type { IncomingMessage, ServerResponse } from "node:http";
import OpenAI from "openai";
import { loadEnv } from "./env.js";
import { getOrCreateSession, resetSession } from "./sessionStore.js";
import {
  VoiceAssistant,
  VoiceFilter,
  handleStudentTurn,
  transcribeStudentAudio,
} from "../voice/index.js";
import type { LessonEvent } from "./teaching/types.js";

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

function sendSseEvent(res: ServerResponse, event: LessonEvent) {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
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
  res: ServerResponse,
  input: {
    sessionId?: string;
    source: "voice" | "chat";
    text: string;
    enableVoice?: boolean;
  },
) {
  const { sessionId, session } = getOrCreateSession(input.sessionId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  try {
    for await (const event of handleStudentTurn({
      session,
      openai,
      plannerModel: env.plannerModel,
      turn: { source: input.source, text: input.text },
      voiceAssistant,
      enableVoice: input.enableVoice !== false,
    })) {
      sendSseEvent(res, event);
    }

    res.write(`event: session\n`);
    res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
    res.end();
  } catch (error) {
    sendSseEvent(res, {
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    res.end();
  }
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
      enableVoice?: boolean;
    };

    if (!body.text?.trim()) {
      sendJson(res, 400, { error: "text is required" });
      return;
    }

    await streamStudentTurn(res, {
      sessionId: body.sessionId,
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
      enableVoice?: boolean;
    };

    if (!body.prompt?.trim()) {
      sendJson(res, 400, { error: "prompt is required" });
      return;
    }

    await streamStudentTurn(res, {
      sessionId: body.sessionId,
      source: "chat",
      text: body.prompt.trim(),
      enableVoice: body.enableVoice,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    const body = (await readJsonBody(req)) as { sessionId?: string };
    if (!body.sessionId || !resetSession(body.sessionId)) {
      sendJson(res, 404, { error: "session not found" });
      return;
    }
    voiceAssistant.cancel();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/session/")) {
    const sessionId = url.pathname.replace("/api/session/", "");
    const { session } = getOrCreateSession(sessionId);
    sendJson(res, 200, {
      sessionId,
      boardState: session.boardState,
    });
    return;
  }

  sendJson(res, 404, { error: "not found" });
}
