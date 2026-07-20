import http from "node:http";
import type { AddressInfo } from "node:net";
import { fixtureTwoCueChoreography } from "./fixtures/choreography.js";

export type MockServerHandle = {
  port: number;
  baseUrl: string;
  decideHits: number;
  close: () => Promise<void>;
};

/**
 * Minimal Mentora-compatible HTTP server for the loop.
 * No OpenAI — decide always returns a deterministic fixture.
 */
export async function startMockMentoraServer(
  preferredPort = 0,
): Promise<MockServerHandle> {
  let decideHits = 0;

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    if (method === "GET" && url.startsWith("/api/health")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "mentora",
          ts: Date.now(),
        }),
      );
      return;
    }

    if (method === "POST" && url.startsWith("/api/lesson/decide")) {
      decideHits += 1;
      const body = await readBody(req);
      let studentAnswer = "fixture";
      try {
        const parsed = JSON.parse(body) as { studentAnswer?: string };
        studentAnswer = parsed.studentAnswer ?? studentAnswer;
      } catch {
        // ignore
      }
      const beat = fixtureTwoCueChoreography({
        nextQuestion: `What follows from: ${studentAnswer.slice(0, 40)}?`,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ beat, source: "mock" }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(preferredPort, "127.0.0.1", () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const port = addr.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    get port() {
      return port;
    },
    get baseUrl() {
      return baseUrl;
    },
    get decideHits() {
      return decideHits;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function waitForHealth(
  baseUrl: string,
  timeoutMs = 10000,
): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        const body = (await res.json()) as { ok?: boolean };
        if (body.ok) return;
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `Health check failed for ${baseUrl} after ${timeoutMs}ms: ${String(lastErr)}`,
  );
}
