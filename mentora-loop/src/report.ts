import type { MentoraProbeEvent } from "@client/testing/mentoraTestProbe";

export type LoopReport = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  iterations: number;
  server: {
    baseUrl: string;
    healthOk: boolean;
    stopped: boolean;
  };
  vitest: {
    exitCode: number | null;
    passed: number;
    failed: number;
    total: number;
  };
  acceptance: Record<string, boolean>;
  probeEventCount: number;
  failures: string[];
  notes: string[];
};

export function emptyAcceptance(): Record<string, boolean> {
  return {
    one_decision_per_student_turn: false,
    one_response_create_per_cue: false,
    actions_before_before_voice: false,
    transcript_trigger_fires_once: false,
    no_double_fire_fallback_transcript: false,
    ops_serialized: false,
    stale_guards_block_board: false,
    cancelled_done_does_not_advance: false,
    completed_done_advances_one_cue: false,
    final_cue_asks_next_and_waits: false,
    no_phantom_reply_loop: false,
    server_always_stops: false,
  };
}

export function buildReport(input: {
  startedAt: string;
  serverBaseUrl: string;
  healthOk: boolean;
  serverStopped: boolean;
  vitestExitCode: number | null;
  vitestPassed: number;
  vitestFailed: number;
  vitestTotal: number;
  acceptance: Record<string, boolean>;
  probeEvents: MentoraProbeEvent[];
  failures: string[];
  notes: string[];
  iterations: number;
}): LoopReport {
  const acceptanceOk = Object.values(input.acceptance).every(Boolean);
  const testsOk =
    input.vitestExitCode === 0 &&
    input.vitestFailed === 0 &&
    input.vitestTotal > 0;
  return {
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    ok: acceptanceOk && testsOk && input.healthOk && input.serverStopped,
    iterations: input.iterations,
    server: {
      baseUrl: input.serverBaseUrl,
      healthOk: input.healthOk,
      stopped: input.serverStopped,
    },
    vitest: {
      exitCode: input.vitestExitCode,
      passed: input.vitestPassed,
      failed: input.vitestFailed,
      total: input.vitestTotal,
    },
    acceptance: input.acceptance,
    probeEventCount: input.probeEvents.length,
    failures: input.failures,
    notes: input.notes,
  };
}
