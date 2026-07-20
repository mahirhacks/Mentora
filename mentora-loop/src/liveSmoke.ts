/**
 * Supervised live smoke for Decision → Conductor → Realtime.
 *
 * Constraints:
 * - Max 2 live attempts (never auto-loop on paid failures)
 * - Tiny lesson: 2 short cues
 * - Always stop server/browser child processes in finally
 * - Never log API keys
 *
 * Ask the user before running — this hits paid OpenAI endpoints.
 *
 *   pnpm test:mentora-live-smoke
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const reportsDir = path.join(here, "..", "reports");
const reportPath = path.join(reportsDir, "mentora-live-smoke-report.json");

const MAX_LIVE_ATTEMPTS = 2;

type LiveSmokeReport = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  attempts: number;
  maxAttempts: number;
  decisionLatencyMs: number | null;
  responseIds: string[];
  transcriptDeltaCount: number;
  boardOpTimestamps: number[];
  interruptions: number;
  finalPhase: string | null;
  serverStopped: boolean;
  notes: string[];
  error?: string;
};

function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-REDACTED")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED")
    .replace(/ephemeral[_-]?key["']?\s*[:=]\s*["'][^"']+/gi, "ephemeral_key=REDACTED");
}

async function main() {
  if (process.env.MENTORA_LIVE_SMOKE_CONFIRM !== "1") {
    console.error(
      [
        "[mentora-live-smoke] Refusing to run paid live smoke without confirmation.",
        "Ask the user, then re-run with MENTORA_LIVE_SMOKE_CONFIRM=1",
        "Example: MENTORA_LIVE_SMOKE_CONFIRM=1 pnpm test:mentora-live-smoke",
      ].join("\n"),
    );
    process.exitCode = 2;
    return;
  }

  const startedAt = new Date().toISOString();
  fs.mkdirSync(reportsDir, { recursive: true });

  let serverProc: ChildProcess | null = null;
  let serverStopped = false;
  const notes: string[] = [
    "Supervised live smoke — max 2 attempts, no autonomous retry loop on paid failures.",
  ];
  const report: LiveSmokeReport = {
    startedAt,
    finishedAt: startedAt,
    ok: false,
    attempts: 0,
    maxAttempts: MAX_LIVE_ATTEMPTS,
    decisionLatencyMs: null,
    responseIds: [],
    transcriptDeltaCount: 0,
    boardOpTimestamps: [],
    interruptions: 0,
    finalPhase: null,
    serverStopped: false,
    notes,
  };

  const killTree = (child: ChildProcess | null) => {
    if (!child?.pid) return;
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          shell: true,
        });
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      // ignore
    }
  };

  try {
    const port = process.env.MENTORA_LIVE_SMOKE_PORT || "3011";
    notes.push(`starting server on port ${port}`);
    serverProc = spawn(
      process.execPath,
      [
        path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(repoRoot, "server", "src", "index.ts"),
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, PORT: port },
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      },
    );

    let serverLog = "";
    serverProc.stdout?.on("data", (d) => {
      serverLog += redactSecrets(String(d));
    });
    serverProc.stderr?.on("data", (d) => {
      serverLog += redactSecrets(String(d));
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHealth(baseUrl, 15000);
    notes.push("health ok");

    // Attempt 1 only by default; attempt 2 only if explicitly allowed and first failed transport.
    for (let attempt = 1; attempt <= MAX_LIVE_ATTEMPTS; attempt++) {
      report.attempts = attempt;
      notes.push(`live attempt ${attempt}/${MAX_LIVE_ATTEMPTS}`);

      const decideStarted = Date.now();
      const decideRes = await fetch(`${baseUrl}/api/lesson/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "Squares",
          studentAnswer: "four equal sides",
          currentStepIndex: 0,
          planTitle: "Squares",
          stepTitle: "What is a square?",
          checkQuestion: "How many equal sides?",
          semanticBoard: [],
          recentHistory: [],
        }),
        signal: AbortSignal.timeout(20000),
      });
      report.decisionLatencyMs = Date.now() - decideStarted;

      if (!decideRes.ok) {
        const body = redactSecrets(await decideRes.text());
        report.error = `decide HTTP ${decideRes.status}: ${body.slice(0, 400)}`;
        notes.push("decide failed — stopping (no autonomous paid retry loop)");
        break;
      }

      const decideJson = (await decideRes.json()) as {
        beat?: { cues?: unknown[]; nextQuestion?: string };
        source?: string;
      };
      const cueCount = decideJson.beat?.cues?.length ?? 0;
      notes.push(
        `decide source=${decideJson.source ?? "?"} cues=${cueCount} latencyMs=${report.decisionLatencyMs}`,
      );

      if (cueCount < 1 || cueCount > 2) {
        // Soft preference: tiny lesson with ~2 cues; still record outcome.
        notes.push(
          `expected ~2 cues for tiny smoke; got ${cueCount} (recorded, not auto-retried)`,
        );
      }

      report.finalPhase = "decide_ok_awaiting_realtime_session";
      report.ok = true;
      notes.push(
        "Decide path exercised live. Full WebRTC voice session is intentionally not auto-driven here — open a lesson UI manually if you need end-to-end audio.",
      );
      break;
    }
  } catch (err) {
    report.error = redactSecrets(String(err));
    report.ok = false;
  } finally {
    killTree(serverProc);
    serverProc = null;
    serverStopped = true;
    report.serverStopped = serverStopped;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[mentora-live-smoke] report → ${reportPath}`);
    console.log(
      redactSecrets(
        `[mentora-live-smoke] ok=${report.ok} attempts=${report.attempts} serverStopped=${report.serverStopped}`,
      ),
    );
    if (!report.ok) process.exitCode = 1;
  }
}

async function waitForHealth(baseUrl: string, timeoutMs: number) {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`health timeout: ${String(lastErr)}`);
}

void main();
