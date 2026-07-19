# Mentora

Voice-first AI teacher for the OpenAI hackathon: **GPT-Realtime-2.1** teaches live over WebRTC, **GPT-5.6 Terra** plans rarely, and a shared Konva whiteboard lets both Mentora and the student draw.

MVP teaches **any topic** you ask (math, science, history, …). The classic demo lesson is expanding `(a+b)²` with an area model.

## Architecture (two models only)

| Model | Role |
|-------|------|
| `gpt-realtime-2.1` | Live voice teacher, barge-in, tools, board control |
| `gpt-5.6-terra` | Lesson plan / replan / optional summary |

Deterministic board engine + app state machine provide discipline. See `ARCHITECTURE.md`.

## Quick start

```bash
cp .env.example .env   # set OPENAI_API_KEY
npm install
npm run smoke          # Phase 0: token + WebRTC + interrupt + Terra
npm run dev            # http://localhost:5173  ·  API :3001
```

### Env

```
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_PLANNER_MODEL=gpt-5.6-terra
PORT=3001
VITE_DEMO_SAFE_MODE=false
```

Set `VITE_DEMO_SAFE_MODE=true` for recorded demos (uses prevalidated `fallbackSquareLesson`, keeps Realtime live).

## How to demo

1. Open http://localhost:5173 → type **any topic** on Home (or pick a suggestion) → **Teach me**
2. Allow microphone — lesson auto-starts for `?topic=…`
3. Mentora plans with Terra (or a topic-aware fallback), draws on the board, asks questions
4. Speak anytime to interrupt; draw with **pen** mid-teach — Mentora receives `student_board_update`
5. Type follow-ups in the dock, or use **Stop AI** / **Mute** / **Restart** / **Stop lesson**
6. On complete → summary for that topic 

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Express + Vite |
| `npm run smoke` | Phase 0 API access gate |
| `npm test` | Shared + client unit tests |

## Design

Desktop UI follows `example_UI/` comps (dark neon Mentora shell). Mobile frames are ignored on purpose.

## Safety

`OPENAI_API_KEY` stays server-side. Browser only receives ephemeral Realtime client secrets.
