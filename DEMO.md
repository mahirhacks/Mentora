# Mentora — Demo Video Script

**Target length:** 2:30–2:55 (hard max under 3:00)  
**Category:** Education  
**On-screen product:** Mentora at `http://localhost:5173`  
**Architecture slides:** open [`ARCHITECTURE.md`](ARCHITECTURE.md) on GitHub (Mermaid renders live)

---

## Before you hit record

### Prep (5–10 min)

1. Restart server + client with a clean browser tab (signed-in only if needed; hide bookmarks bar).
2. Confirm `.env` models (do **not** show this file on camera):
   - `gpt-5.6-terra`
   - `gpt-4o-mini-transcribe`
   - `gpt-realtime-2.1-mini`
3. Warm up once off-camera:
   - Python variables lesson → answer `24` → second turn
   - Optional: circle one word in a short code/text board (precision beat)
   - Fractions starter
4. Open these in extra tabs (for cutaways):
   - `ARCHITECTURE.md` on GitHub — “System at a glance” + “Three models, three jobs”
   - Terminal ready to run `npm run verify` (already green is fine; re-run live if time)
5. Zoom UI so captions + board are readable. Mic muted in Mentora until you want voice input; **typed input is the reliable hero path**.

### How to shoot

- Record **separate clips**, then edit. Do not rely on one perfect take.
- Keep the **caption bar visible** in every product shot.
- Prefer **typed chat** for the main lesson; use voice only if it is already stable in rehearsal.
- If a live turn fails twice, cut to the typed backup or a clearly labelled architecture diagram — never fake a live model call.

### What never appears on screen

- `.env`, API keys, Network tab secrets
- Internal object IDs / debug observation dumps
- Terminal errors or failed turns
- Claims of classroom cloud sync / multi-user accounts / “always correct”

---

## Project copy (Devpost paste)

**One-line:** Mentora turns a beginner’s specific confusion into a verified visual teaching metaphor, builds it on a shared canvas, and teaches through it conversationally.

**Problem:** Beginners often get more rephrased text when they need a visual model of what they misunderstood. Static diagrams rarely match the exact question; unconstrained AI drawings are hard to trust.

**Solution:** GPT-5.6 (`gpt-5.6-terra`) plans one short adaptive teaching turn. A local validator and deterministic board tools preflight the visual on a **cloned** board. Only verified snapshots reach the learner. Realtime voice (`gpt-realtime-2.1-mini`) performs the validated line. Every turn ends with one diagnostic question. Board text is expanded word-by-word so student marks can name an exact keyword.

**Scope:** Foundational visuals — boxes, labels, equations, highlights, simple shapes/process layouts, code snippets. Local session resume. Not dense scientific illustration or advanced notation.

---

## Full script (2:45)

Record in six clips. Timestamps are edit targets, not live stopwatch pressure.

---

### CLIP A — Hook (0:00–0:20)

**Show**

| Beat | What to do on screen | Camera / framing notes |
| --- | --- | --- |
| A1 | Home / Mentora title, empty lesson board | Full UI; hide clutter; Mentora name readable |
| A2 | Start Python variables lesson (starter or type a short prompt) | Status may flash Planning → Drawing → Speaking — good |
| A3 | Board shows variable as a container: name + value (e.g. `age` / `24`) | Hold 2 seconds on the finished visual |
| A4 | Caption shows the diagnostic question (e.g. value stored in `age`) | Caption bar must be visible |

**Say (voiceover)**

> Beginners don’t always need more text. They need the right picture for the exact thing they misunderstand. Mentora just turned a Python variable into a visual container — and taught through it.

**Director notes**

- This is the emotional hook. Don’t explain architecture yet.
- If voice is flaky, still show captions from typed pipeline — judges need to *see* teaching.

---

### CLIP B — Adaptive second turn (0:20–0:55)

**Show**

| Beat | What to do on screen | Camera / framing notes |
| --- | --- | --- |
| B1 | Type the answer (e.g. `24`) and send | Show the chat send clearly |
| B2 | Board **keeps** previous objects | Zoom slightly so reuse is obvious |
| B3 | New step appears (e.g. increment / next idea) | Planning → Drawing → Speaking again |
| B4 | New caption + next question | Hold on adaptive continuity |

**Say (voiceover)**

> The student answers. Mentora keeps the board, confirms what landed, and advances one step. This isn’t a retrieved slide — the visual and the teaching sequence are generated for *this* conversation.

**Director notes**

- This clip proves “adaptive,” not just “pretty first frame.”
- Do not reset between A and B.

---

### CLIP C — Generality (0:55–1:15)

**Show**

| Beat | What to do on screen | Camera / framing notes |
| --- | --- | --- |
| C1 | New lesson / reset; open fractions starter (or type a short fractions ask) | Clean cut from variables |
| C2 | Fraction bar / equal regions appear | Emphasize different visual grammar |
| C3 | Caption + focused question (e.g. `1/4`) | Hold 2 seconds |

**Say (voiceover)**

> Same system, different visual grammar. Mentora builds a fraction from deterministic board tools — then asks one focused check question.

**Director notes**

- Keep this short. One clean success beats a long fragile lesson.

---

### CLIP D — Precision marking (1:15–1:35)  ← high-signal engineering beat

**Show**

| Beat | What to do on screen | Camera / framing notes |
| --- | --- | --- |
| D1 | Short board with multi-word text/code already on canvas (or ask Mentora for a tiny Go/Python snippet) | Words should be separable |
| D2 | Student tool: circle / mark **one** word (e.g. `func` or `print`) | Make the mark obvious |
| D3 | Ask: “Exactly which word did I mark?” | Typed is fine |
| D4 | Mentora names that exact word in caption/chat | Hold on the correct word + highlight if present |

**Say (voiceover)**

> And because board text is stored word-by-word — not as one blob — when I mark a single keyword, Mentora can name *that* word. Precision of attention needs precision of representation.

**Director notes**

- This is your “excellent engineering” product beat. Prefer this over more architecture jargon if time is tight.
- If marking is slow, pre-stage the board off-camera, then only record mark → ask → answer.

---

### CLIP E — Architecture (1:35–2:15)

**Show**

| Beat | What to do on screen | Camera / framing notes |
| --- | --- | --- |
| E1 | GitHub `ARCHITECTURE.md` — **System at a glance** diagram | Full-screen browser; zoom until readable |
| E2 | Scroll or cut to **Three models, three jobs** | Point cursor at Planner vs Voice |
| E3 | Optional 3-second cut: `prepareTeachingTurn` / validator file names in editor | No need to read code aloud |
| E4 | Optional: terminal `npm run verify` green | Only if it stays clean |

**Say (voiceover)**

> GPT-5.6 Terra is the teaching planner. It chooses the metaphor, the tool steps, and the question — but it cannot mutate the live board. Mentora validates the script, runs every tool on a clone, and only then streams verified snapshots. Realtime Mini performs the validated line against verified board context. The planner plans. The voice only performs.

**Director notes**

- Spend camera time on the **diagram**, not scrolling code.
- Say model names once, clearly: Terra / mini-transcribe / realtime-2.1-mini is optional detail; “GPT-5.6 planner + Realtime performer” is enough if rushing.
- Hit the line: **“The planner plans; the voice only performs.”**

---

### CLIP F — Reliability + Codex + close (2:15–2:45)

**Show**

| Beat | What to do on screen | Camera / framing notes |
| --- | --- | --- |
| F1 | `npm run verify` passing (or test summary) | 4–6 seconds max |
| F2 | Cut back to strongest board (variables or precision mark) | Product, not terminal |
| F3 | End card: **Mentora** + one-line tagline | Clean freeze |

**Say (voiceover)**

> Codex helped me design this architecture, chase real runtime bugs — off-canvas placement, oversized scripts — and turn them into golden-lesson and safety tests. Mentora doesn’t just answer a learner. It invents the visual explanation, builds it safely, and teaches through it.

**Director notes**

- Codex mention is required for Build Week judging — keep it concrete (architecture + bugs → tests), not “AI wrote my app.”
- End on the product, not the terminal.

---

## Alternate tight cut (if editing time is short)

Use only **A → B → D → E → F** (skip fractions). Still under 3 minutes and still shows adaptive + precision + architecture.

---

## Voiceover full read (paste into teleprompter)

> Beginners don’t always need more text. They need the right picture for the exact thing they misunderstand. Mentora just turned a Python variable into a visual container — and taught through it.
>
> The student answers. Mentora keeps the board, confirms what landed, and advances one step. This isn’t a retrieved slide — the visual and the teaching sequence are generated for this conversation.
>
> Same system, different visual grammar. Mentora builds a fraction from deterministic board tools — then asks one focused check question.
>
> And because board text is stored word-by-word — not as one blob — when I mark a single keyword, Mentora can name that word. Precision of attention needs precision of representation.
>
> GPT-5.6 Terra is the teaching planner. It chooses the metaphor, the tool steps, and the question — but it cannot mutate the live board. Mentora validates the script, runs every tool on a clone, and only then streams verified snapshots. Realtime performs the validated line against verified board context. The planner plans. The voice only performs.
>
> Codex helped me design this architecture, chase real runtime bugs — off-canvas placement, oversized scripts — and turn them into golden-lesson and safety tests. Mentora doesn’t just answer a learner. It invents the visual explanation, builds it safely, and teaches through it.

---

## Edit checklist

- [ ] Under 3:00
- [ ] Captions visible in product clips
- [ ] Adaptive second turn included
- [ ] Architecture diagram readable (ARCHITECTURE.md)
- [ ] Codex called out with a real engineering outcome
- [ ] Models / roles stated without flashing `.env`
- [ ] No errors, keys, or internal IDs
- [ ] End on Mentora product frame
- [ ] YouTube: public (or unlisted if Devpost allows — prefer public)
- [ ] Audio covers both **Codex** and **GPT-5.6** usage (Build Week requirement)

---

## Submission checklist (external)

- [x] Live rehearsals logged in `REHEARSAL_RESULTS.md`
- [ ] Record/edit video under 3 minutes
- [ ] Upload screenshot or GIF
- [ ] Add public asset URLs to `README.md` + Devpost
- [ ] Repo public for judges
- [ ] Category: **Education**
- [ ] Cursor `/feedback` Session ID → Devpost + `project_story.md`
- [ ] Paste project copy + limitations
- [ ] Test all public links signed-out
- [ ] Submit with ≥1 hour buffer
