# Mentora Build Week Submission Pack

## Project copy

**Category:** Education

**One-line description:** Mentora turns a beginner's specific confusion into a
verified visual teaching metaphor, builds it on a shared canvas, and teaches
through it conversationally.

**Problem:** Beginners often receive repeated textual explanations when the
missing piece is a visual model constructed around what they misunderstood.
Static diagrams rarely match the exact question, while unconstrained generated
diagrams are difficult to trust.

**Solution:** GPT-5.6 plans one short adaptive teaching turn. A strict local
validator and ten deterministic tools preflight the entire visual on cloned
state. Only verified snapshots reach the learner. Realtime voice performs the
validated explanation against the resulting board state, and every turn ends
with one diagnostic question.

**Current scope:** Foundational lessons that fit boxes, labels, equations,
highlights, simple polygons, arrows, and basic process layouts. Sessions
persist locally on disk so learners can resume from the home page. Complex
scientific illustrations and advanced notation are explicitly out of scope for
this build.

## 2:45 recording plan

Record independent clips first. Capture the typed-input backup before the
voice version. Keep the caption bar visible in every product shot.

### 0:00–0:20 — Hook

Visible:

- Mentora title and empty board;
- click the Python variables starter;
- the variable box, `age`, and `24` appear;
- caption asks: “What value is stored in age?”

Voiceover:

> Beginners do not always need more text. They need the right picture for the
> exact thing they misunderstand. Mentora just turned a Python variable into a
> visual container and taught through it.

### 0:20–0:55 — Adaptive follow-up

Visible:

- type `24`;
- existing objects remain;
- `age + 1` and `25` appear;
- status changes through Planning, Drawing, and Speaking.

Voiceover:

> The student answers, Mentora keeps the existing board, confirms what was
> understood, and advances one step. This is not a retrieved slide: the visual
> and teaching sequence are generated for the current conversation.

### 0:55–1:20 — Generality proof

Visible:

- reset;
- click the fractions starter;
- a rectangle is divided into four equal regions;
- the `1/4` caption and final question appear.

Voiceover:

> The same system can choose another visual grammar. Here it constructs a
> fraction bar with deterministic tools and asks a focused question.

### 1:20–2:05 — Architecture

Visible:

- the README architecture diagram;
- brief cuts of `validateTeachingScriptPayload`,
  `prepareTeachingTurn`, and a golden test.

Voiceover:

> GPT-5.6 is the teaching planner. It chooses the pedagogy, visual metaphor,
> sequence, references, and diagnostic question. Its output cannot directly
> mutate the board. Mentora validates the full script, executes all tools on a
> clone, verifies every referenced object, and then streams turn-scoped,
> sequenced snapshots. Realtime performs only the validated line against
> verified board context.

### 2:05–2:30 — Reliability and Codex

Visible:

- `npm run verify` passing;
- server and client test totals;
- Stop and Retry controls.

Voiceover:

> Codex helped trace the real runtime, reproduce an off-canvas placement bug
> and an oversized-script failure, and turn those findings into cancellation,
> ordering, parser, tool, and golden-lesson tests. We kept the tool set narrow
> and added local session resume only after the teaching loop was reliable.

### 2:30–2:45 — Close

Visible:

- strongest completed variable board;
- caption and final question;
- product name.

Voiceover:

> Mentora does not just answer a learner. It invents the visual explanation,
> builds it safely, and teaches through it.

## Recording rules

Must show:

- captions;
- at least one adaptive second turn;
- variables and one generality lesson;
- the architecture boundary between GPT-5.6 and deterministic execution;
- a passing root verification command;
- the honest supported scope.

Do not show:

- API keys or `.env`;
- internal observations, object bounds, or generated IDs;
- terminal errors;
- unsupported complex topics;
- claims of multi-user accounts, cloud sync, classroom deployment, or
  guaranteed correctness;
- more than one optional retake before a complete usable cut exists.

If voice choreography fails, use the typed-input recording and retain the exact
captions. If a live prompt fails twice in rehearsal, use the corresponding
golden fixture only as a clearly labelled deterministic architecture demo; do
not represent it as a live model response.

## Final external checklist

These steps require the project owner's account or recording environment:

- [x] Run the three approved live prompts three times each. Results are in
      `REHEARSAL_RESULTS.md` (8/9 first-pass valid, 0/30 tool failures).
- [ ] Record and edit a public video under three minutes.
- [ ] Upload at least one screenshot or short GIF.
- [ ] Add the public asset URLs to `README.md` and the submission form.
- [ ] Confirm the repository is publicly accessible to judges.
- [ ] Select the Education category.
- [ ] Run Cursor `/feedback` and paste the resulting Codex Session ID into the
      submission form.
- [ ] Paste the project copy above and include the limitations.
- [ ] Test every public URL in a signed-out browser.
- [ ] Submit with at least one hour remaining for upload or form failures.
