# Mentora

Voice-first AI teacher with a live drawing board. Mentora plans short teaching turns, draws on a 1280×720 canvas, and walks students through one concept at a time.

## Project structure

| Package | Purpose |
|---------|---------|
| `client/` | React + Vite UI — canvas, chat, transcript |
| `server/` | HTTP API, teaching planner, deterministic board tools |
| `debug/` | Terminal REPL to test planner scripts without the browser |

## Quick start

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your `OPENAI_API_KEY`.

### 2. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
cd ../debug && npm install
```

### 3. Run the app

In two terminals:

```bash
# Terminal 1 — API server (port 3001)
npm run server

# Terminal 2 — web UI (port 5173)
npm run client
```

Open http://localhost:5173, type a topic or question, and Mentora will plan a teaching turn on the board.

## Scripts

From the repo root:

| Command | Description |
|---------|-------------|
| `npm run server` | Start the teaching API server |
| `npm run client` | Start the Vite dev server |
| `npm run debug` | Open the terminal planner REPL |
| `npm run tools` | Run board tool CLI (`list`, `demo`, `run`) |

## Board tools

The server exposes deterministic canvas tools the planner can call:

- `create_shape`, `divide_region`, `label_in`, `place_relative`
- `write_text`, `highlight`, `point_at`
- `erase_object`, `reset_board`

Test a tool from the CLI:

```bash
cd server
npm run tools -- list
npm run tools -- demo
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | Required. OpenAI API key |
| `OPENAI_PLANNER_MODEL` | `gpt-5.6-sol` | Model for teaching script planning |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1-mini` | Reserved for future voice integration |
| `PORT` | `3001` | Server port |
| `VITE_DEMO_SAFE_MODE` | `false` | Client demo flag |

## Architecture

1. **Planner** — GPT generates a short teaching script (`speak`, `tool`, `observe` steps) via `submit_teaching_script`.
2. **Script player** — Server executes tool steps against an in-memory board state and streams events over SSE.
3. **Canvas renderer** — Client draws shapes, text, labels, highlights, and pointers from board state.
4. **Layout guards** — Placement and boundary clamping keep content inside the visible 1280×720 safe zone.

## License

Private hackathon project.
