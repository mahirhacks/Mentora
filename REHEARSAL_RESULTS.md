# Approved Live Rehearsal Results

Date: 2026-07-20

Scope: exactly nine paid GPT-5.6 planner rehearsals, approved by the project
owner. Each topic ran three times through the production prompt/schema and the
debug tool executor. Realtime voice was not invoked by this rehearsal.

## Aggregate

- 9 runs completed without provider or process errors.
- 8 of 9 model scripts passed the strict production parser.
- 30 generated tool steps executed with 0 tool failures.
- 0 educational objects were auto-erased.
- 4 placements were clamped safely into the canvas.
- Median end-to-end planner/harness latency: 7.19 seconds.
- Slowest run: 10.70 seconds.

The failed run was the second Python variables attempt. Its script was rejected
before execution, leaving the board empty. In the production server this result
receives the single bounded repair attempt; the debug rehearsal intentionally
made one planner call per run to keep the approved live-call count exact.

## Variables

- Run 1: valid, 9 steps, 6 tools, 0 failures, 10.70 seconds.
- Run 2: rejected by strict parsing, no tools executed, 7.24 seconds.
- Run 3: valid, 8 steps, 4 tools, 0 failures, 7.30 seconds.

Result: 2 of 3 first-pass scripts valid. Keep the typed backup and the
deterministic golden fixture ready for recording.

## Fractions

- Run 1: valid, 8 steps, 5 tools, 0 failures, one clamp, 7.78 seconds.
- Run 2: valid, 8 steps, 4 tools, 0 failures, 7.04 seconds.
- Run 3: valid, 9 steps, 5 tools, 0 failures, one clamp, 7.19 seconds.

Result: 3 of 3 valid. The bounds guard corrected two placements without tool
failure or object deletion.

## Arithmetic

- Run 1: valid, 5 steps, 2 tools, 0 failures, one clamp, 5.24 seconds.
- Run 2: valid, 5 steps, 2 tools, 0 failures, one clamp, 6.07 seconds.
- Run 3: valid, 5 steps, 2 tools, 0 failures, 5.99 seconds.

Result: 3 of 3 valid and the fastest live topic.

## Recording decision

Use arithmetic as the safest fallback. Fractions is the strongest generality
proof. Variables remains the core story, but record its typed-input clip first
and do not rely on the first live attempt being valid.
