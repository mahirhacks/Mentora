/**
 * Bounded Mentora loop runner:
 * start mock server → health → vitest → JSON report → always stop server.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import {
  startMockMentoraServer,
  waitForHealth,
  type MockServerHandle,
} from "./mockServer.js";
import {
  buildReport,
  emptyAcceptance,
  type LoopReport,
} from "./report.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const loopRoot = path.resolve(here, "..");
const reportsDir = path.join(loopRoot, "reports");
const reportPath = path.join(reportsDir, "mentora-loop-report.json");
const acceptancePath = path.join(reportsDir, "acceptance-flags.json");
const vitestJsonPath = path.join(reportsDir, "vitest-results.json");

const MAX_FIX_ITERATIONS = 5;

async function main() {
  const startedAt = new Date().toISOString();
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(acceptancePath, JSON.stringify(emptyAcceptance(), null, 2));

  let server: MockServerHandle | null = null;
  let healthOk = false;
  let serverStopped = false;
  let vitestExit: number | null = null;
  let passed = 0;
  let failed = 0;
  let total = 0;
  const failures: string[] = [];
  const notes: string[] = [
    "Decision and Realtime are mocked — no paid OpenAI calls.",
    "Server is an ephemeral mock Mentora HTTP process for /api/health (+ decide).",
  ];
  let child: ChildProcess | null = null;

  const killChild = () => {
    if (!child || child.killed) return;
    try {
      if (process.platform === "win32" && child.pid) {
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
    console.log("[mentora-loop] starting mock server…");
    server = await startMockMentoraServer(0);
    process.env.MENTORA_LOOP_BASE_URL = server.baseUrl;
    process.env.MENTORA_TEST_MODE = "1";

    console.log(`[mentora-loop] waiting for health at ${server.baseUrl}…`);
    await waitForHealth(server.baseUrl);
    healthOk = true;
    console.log("[mentora-loop] health ok");

    // Health-only smoke against live mock decide endpoint (still mocked, no OpenAI)
    const decideRes = await fetch(`${server.baseUrl}/api/lesson/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "Squares",
        studentAnswer: "four sides",
        currentStepIndex: 0,
        semanticBoard: [],
        recentHistory: [],
      }),
    });
    if (!decideRes.ok) {
      failures.push(`mock decide HTTP failed: ${decideRes.status}`);
    } else {
      notes.push("mock /api/lesson/decide returned fixture choreography");
    }

    console.log("[mentora-loop] running vitest scenarios…");
    const vitestBin = path.resolve(
      loopRoot,
      "..",
      "node_modules",
      "vitest",
      "vitest.mjs",
    );
    const result = await runProcess(
      process.execPath,
      [
        vitestBin,
        "run",
        "--config",
        path.join(loopRoot, "vitest.config.ts"),
      ],
      {
        cwd: loopRoot,
        env: {
          ...process.env,
          MENTORA_LOOP_BASE_URL: server.baseUrl,
          MENTORA_TEST_MODE: "1",
        },
        onSpawn: (c) => {
          child = c;
        },
      },
    );
    vitestExit = result.code;
    child = null;

    const counts = readVitestCounts(vitestJsonPath);
    passed = counts.passed;
    failed = counts.failed;
    total = counts.total;
    if (result.code !== 0) {
      failures.push(`vitest exited with code ${result.code}`);
      if (result.stderr.trim()) {
        failures.push(result.stderr.trim().slice(0, 2000));
      }
    }

    let acceptance = readAcceptance();
    // Server stop verified in finally — mark after close
    acceptance = { ...acceptance };

    const report = buildReport({
      startedAt,
      serverBaseUrl: server.baseUrl,
      healthOk,
      serverStopped: false, // updated after finally path via rewrite
      vitestExitCode: vitestExit,
      vitestPassed: passed,
      vitestFailed: failed,
      vitestTotal: total,
      acceptance,
      probeEvents: [],
      failures,
      notes: [
        ...notes,
        `vitest stdout tail: ${result.stdout.trim().slice(-800)}`,
      ],
      iterations: 1,
    });

    // Close server before finalizing stop flag
    await server.close();
    serverStopped = true;
    server = null;
    acceptance.server_always_stops = true;
    fs.writeFileSync(acceptancePath, JSON.stringify(acceptance, null, 2));

    const finalReport: LoopReport = {
      ...report,
      server: { ...report.server, stopped: true },
      acceptance,
      ok:
        report.ok === false
          ? Object.values(acceptance).every(Boolean) &&
            vitestExit === 0 &&
            failed === 0 &&
            total > 0 &&
            healthOk
          : Object.values(acceptance).every(Boolean) &&
            vitestExit === 0 &&
            healthOk,
      finishedAt: new Date().toISOString(),
    };
    // Recompute ok properly
    finalReport.ok =
      Object.values(finalReport.acceptance).every(Boolean) &&
      finalReport.vitest.exitCode === 0 &&
      finalReport.vitest.failed === 0 &&
      finalReport.vitest.total > 0 &&
      finalReport.server.healthOk &&
      finalReport.server.stopped;

    fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
    console.log(`[mentora-loop] report → ${reportPath}`);
    console.log(
      `[mentora-loop] ok=${finalReport.ok} passed=${passed} failed=${failed} total=${total}`,
    );
    printAcceptance(finalReport.acceptance);

    if (!finalReport.ok) {
      process.exitCode = 1;
    }
  } catch (err) {
    failures.push(String(err));
    console.error("[mentora-loop] fatal", err);
    process.exitCode = 1;
    const acceptance = readAcceptance();
    const report = buildReport({
      startedAt,
      serverBaseUrl: server?.baseUrl ?? "",
      healthOk,
      serverStopped: false,
      vitestExitCode: vitestExit,
      vitestPassed: passed,
      vitestFailed: failed,
      vitestTotal: total,
      acceptance,
      probeEvents: [],
      failures,
      notes,
      iterations: 1,
    });
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    } catch {
      // ignore
    }
  } finally {
    killChild();
    if (server) {
      try {
        await server.close();
        serverStopped = true;
      } catch (err) {
        console.error("[mentora-loop] server close failed", err);
      }
    }
    // Ensure report reflects stop if we crashed mid-run
    if (fs.existsSync(reportPath)) {
      try {
        const existing = JSON.parse(
          fs.readFileSync(reportPath, "utf8"),
        ) as LoopReport;
        existing.server.stopped = serverStopped || existing.server.stopped;
        if (serverStopped) {
          existing.acceptance.server_always_stops = true;
        }
        existing.ok =
          Object.values(existing.acceptance).every(Boolean) &&
          existing.vitest.exitCode === 0 &&
          existing.vitest.failed === 0 &&
          existing.vitest.total > 0 &&
          existing.server.healthOk &&
          existing.server.stopped;
        existing.finishedAt = new Date().toISOString();
        fs.writeFileSync(reportPath, JSON.stringify(existing, null, 2));
      } catch {
        // ignore
      }
    }
    console.log(
      `[mentora-loop] cleanup done (serverStopped=${serverStopped})`,
    );
    void MAX_FIX_ITERATIONS; // documented bound for agent fix loop
  }
}

function readAcceptance(): Record<string, boolean> {
  if (!fs.existsSync(acceptancePath)) return emptyAcceptance();
  try {
    return {
      ...emptyAcceptance(),
      ...JSON.parse(fs.readFileSync(acceptancePath, "utf8")),
    };
  } catch {
    return emptyAcceptance();
  }
}

function readVitestCounts(file: string): {
  passed: number;
  failed: number;
  total: number;
} {
  if (!fs.existsSync(file)) return { passed: 0, failed: 0, total: 0 };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      numPassedTests?: number;
      numFailedTests?: number;
      numTotalTests?: number;
    };
    return {
      passed: raw.numPassedTests ?? 0,
      failed: raw.numFailedTests ?? 0,
      total: raw.numTotalTests ?? 0,
    };
  } catch {
    return { passed: 0, failed: 0, total: 0 };
  }
}

function printAcceptance(flags: Record<string, boolean>) {
  console.log("[mentora-loop] acceptance:");
  for (const [k, v] of Object.entries(flags)) {
    console.log(`  ${v ? "PASS" : "FAIL"}  ${k}`);
  }
}

function runProcess(
  command: string,
  args: string[],
  opts: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    onSpawn?: (child: ChildProcess) => void;
  },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    opts.onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      const s = String(d);
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr?.on("data", (d) => {
      const s = String(d);
      stderr += s;
      process.stderr.write(s);
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

void main();
