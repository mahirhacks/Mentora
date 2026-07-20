# Mentora Loop (detachable)

Bounded autonomous test harness for **Decision → TeachingConductor → Realtime** voice coordination.

## Run

```bash
pnpm test:mentora-loop
# or
npm run test:mentora-loop
```

## What it does

1. Starts a local mock Mentora server (`/api/health` + mocked `/api/lesson/decide`)
2. Waits for health
3. Runs deterministic integration scenarios (no paid OpenAI)
4. Writes `mentora-loop/reports/mentora-loop-report.json`
5. Always stops the server (and child processes) in `finally`

## Detach later

This folder is self-contained except for:

- Thin production probes: `client/src/testing/mentoraTestProbe.ts`
- Optional decide override: `setDecideTeachingBeatOverride` in `client/src/api/lessonApi.ts`
- Probe emit calls in `TeachingConductor.ts` / `turnGate.ts` (no-ops unless a sink is registered)

To detach: remove the root script, delete this folder, and optionally strip probe calls / override API.
