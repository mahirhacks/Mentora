import type { IncomingMessage, ServerResponse } from "node:http";
import OpenAI from "openai";
import { loadEnv } from "./env.js";
import { getOrCreateSession, resetSession } from "./sessionStore.js";
import { streamTeachingScript } from "./teaching/planner.js";
import { playTeachingScript } from "./teaching/scriptPlayer.js";
import type { LessonEvent } from "./teaching/types.js";

const env = loadEnv();
const openai = new OpenAI({ apiKey: env.openaiApiKey });

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

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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

  if (req.method === "POST" && url.pathname === "/api/teach") {
    const body = (await readJsonBody(req)) as {
      prompt?: string;
      sessionId?: string;
    };

    if (!body.prompt?.trim()) {
      sendJson(res, 400, { error: "prompt is required" });
      return;
    }

    const { sessionId, session } = getOrCreateSession(body.sessionId);
    session.refreshSystemPrompt();
    session.addUserPrompt(body.prompt.trim());

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    sendSseEvent(res, { type: "planning" });

    try {
      const script = await streamTeachingScript(
        openai,
        env.plannerModel,
        session,
      );

      if (script.length === 0) {
        sendSseEvent(res, {
          type: "error",
          message: "No teaching script was generated.",
        });
        res.end();
        return;
      }

      for await (const event of playTeachingScript(session, script)) {
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
    const { session } = getOrCreateSession(sessionId);
    sendJson(res, 200, {
      sessionId,
      boardState: session.boardState,
    });
    return;
  }

  sendJson(res, 404, { error: "not found" });
}
