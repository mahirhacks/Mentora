# Mentora — Implementation Tasks

Ordered checklist. Complete phases in sequence. Check items as they land.

Legend: `[ ]` todo · `[x]` done · `[~]` in progress

---

## Phase 0 — Docs and smoke (do first)

### Docs

- [x] Write `ARCHITECTURE.md`
- [x] Write `TASKS.md`
- [x] Write investor-grade `README.md`
- [x] Add `.env.example`

### Scaffold

- [x] Root npm workspaces (`client`, `server`, `shared`)
- [x] Express server bootstrap + `GET /api/health`
- [x] Vite + React + TypeScript client shell
- [x] Shared TypeScript package wired into both sides
- [x] `npm run dev` starts server + client via concurrently
- [x] `.gitignore` covers `.env`, `node_modules`, `dist`

### Smoke test (`npm run smoke`)

- [x] Implement `server/scripts/smoke.ts`
- [x] Mint ephemeral Realtime token
- [x] Establish WebRTC / SDP handshake
- [x] Verify interruption path
- [x] One `gpt-5.6-terra` structured Responses call
- [x] Fail fast with clear errors if key lacks access
- [x] Confirmed on demo key: `gpt-realtime-2.1` + `gpt-5.6-terra`

---

## Phase 1 — Deterministic board (+ student ink)

- [x] Fixed-size Konva stage
- [x] `BoardObjectRegistry` by stable ID
- [x] Zod board action schemas
- [x] `BoardActionExecutor` + sequential queue
- [x] Non-blocking `point_at` / `highlight`
- [x] Laser pointer UI + KaTeX overlay
- [x] Student ink layer + pen/eraser/clear
- [x] Hard-coded square-formula sequence
- [x] Unit tests

---

## Phase 2 — Realtime voice

- [x] `POST /api/realtime/token` + Safety-Identifier
- [x] Never expose `OPENAI_API_KEY` to browser
- [x] WebRTC client, mic, remote audio, data channel
- [x] GA session config (semantic_vad, marin, reasoning low)
- [x] Mentora instructions
- [x] Start / Stop AI / Mute / Restart / Stop lesson UI
- [ ] Manual verify barge-in in browser (human QA)
- [x] Reconnect via Restart (new token)

---

## Phase 3 — Realtime tools

- [x] Register tools: board_apply_actions, create_lesson_plan, replan_lesson, update_lesson_state, complete_lesson
- [x] Zod validate; reject malformed; retry hint
- [x] EventRouter + toolHandlers
- [x] `student_board_update` injection from ink idle
- [x] Unit tests for queue / validation

---

## Phase 4 — GPT-5.6 Terra planner

- [x] LessonPlan schema + fallbackSquareLesson
- [x] `POST /api/lesson/plan|replan|summary`
- [x] Terra Responses strict SO + Zod + fallback
- [x] Demo Safe Mode path (`VITE_DEMO_SAFE_MODE`)

---

## Phase 5 — Teaching logic

- [x] LessonRuntimeState + teaching store
- [x] Teaching state machine helpers
- [x] Classifications incl. student_visual_attempt
- [x] Silence watchdog (10s, suspend on draw)
- [x] Mid-teach voice+draw path
- [x] Unit tests

---

## Phase 5b — Desktop UI from `example_UI/`

- [x] Dark neon tokens + AppShell left nav
- [x] Home / Lessons / Live lesson / Summary / Settings / Stats stub
- [x] Live lesson: tools + board + Mentora sidebar + voice dock
- [x] Voice status chips Thinking/Speaking/Waiting/Listening
- [x] No mobile layouts

---

## Phase 6 — Verify

- [x] `npm test` green
- [x] `npm run smoke` green
- [x] `npm run dev` one-command
- [x] README written
- [ ] Human E2E acceptance matrix (user testing)
- [ ] Record backup demo video
- [ ] Rehearse pitch

---

## Explicit non-goals

- [x] ~~Separate STT/TTS~~
- [x] ~~Auth/DB/payments/mobile/camera~~
- [x] ~~Full curriculum / OCR from ink~~
- [x] ~~Four independent agents~~

---

## Definition of done

MVP code complete when Phase 0 smoke is green, unit tests pass, and the app runs end-to-end for human QA. Remaining: browser acceptance matrix + demo recording.
