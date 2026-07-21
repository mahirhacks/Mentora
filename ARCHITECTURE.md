# Mentora Architecture

Mentora is a **voice-first visual teaching system** with a deliberate trust boundary:

> GPT-5.6 plans. Deterministic tools build. Validators verify. Realtime only performs.

The model never gets unchecked write access to the live board. That separation is the product.

---

## 1. System at a glance

```mermaid
flowchart TB
  subgraph Learner["Learner surface"]
    Chat[Typed chat]
    Mic[Voice mic]
    Draw[Canvas marks / draws]
  end

  subgraph Ingress["Input normalization"]
    STT["Transcriber<br/>gpt-4o-mini-transcribe"]
    Canon[Canonical student text + board context]
  end

  subgraph Brain["Teaching brain — plans only"]
    Planner["GPT-5.6 Terra planner<br/>gpt-5.6-terra"]
    Script[Teaching script<br/>speak + tools + question]
  end

  subgraph Trust["Trust boundary — no live mutation yet"]
    Validate[Strict script validator]
    Clone[Clone BoardState]
    Preflight[Deterministic tool preflight]
    Snapshots[Verified turn snapshots]
  end

  subgraph Delivery["Delivery — server authoritative"]
    SSE[Turn-scoped sequenced SSE]
    Canvas[React canvas renderer]
    Voice["Realtime performer<br/>gpt-realtime-2.1-mini"]
    Caps[Captions + PCM playback]
  end

  Chat --> Canon
  Mic --> STT --> Canon
  Draw --> Canon
  Canon --> Planner
  Planner --> Script
  Script --> Validate
  Validate --> Clone --> Preflight --> Snapshots
  Snapshots --> SSE
  SSE --> Canvas
  SSE --> Voice
  Canvas --> Voice
  Voice --> Caps
```

**Why this shape wins:** planning intelligence is separated from board mutation and from spoken delivery. Each stage can fail safely without corrupting the learner’s canvas.

---

## 2. Three models, three jobs

The early failure mode was role bleed: planner and voice both tried to invent the lesson. Mentora forbids that.

```mermaid
flowchart LR
  subgraph Inputs
    U[Student text / voice / marks]
    B[Verified board observation]
  end

  subgraph PlannerOnly["Planner — gpt-5.6-terra"]
    P[Choose pedagogy + metaphor]
    T[Emit tool steps]
    Q[Emit diagnostic question]
    S[Emit voice_script lines]
  end

  subgraph Never["Hard rules"]
    N1[No live board writes]
    N2[No freestyle tool execution]
  end

  subgraph Tools["Deterministic executor"]
    V[Validate script]
    X[Run tools on clone]
    C[Commit prepared snapshots only]
  end

  subgraph VoiceOnly["Voice — gpt-realtime-2.1-mini"]
    R[Perform validated line]
    A[Stay faithful to board facts]
  end

  U --> P
  B --> P
  P --> T
  P --> Q
  P --> S
  T --> V
  S --> V
  V --> X --> C
  C --> R
  B --> R
  R --> A
```

| Role | Model | Allowed to do | Forbidden from doing |
| --- | --- | --- | --- |
| Transcriber | `gpt-4o-mini-transcribe` | Speech → text | Teaching, drawing, planning |
| Planner | `gpt-5.6-terra` | Write teaching script | Mutate live board, speak freely |
| Executor | Local TypeScript tools | Build/verify visuals | Invent pedagogy |
| Voice | `gpt-realtime-2.1-mini` | Speak validated lines | Plan lessons or invent board facts |

**The planner plans; the voice only performs.**

---

## 3. One teaching turn (trust boundary)

This is the critical engineering loop to show in the demo.

```mermaid
sequenceDiagram
  autonumber
  participant L as Learner
  participant API as Mentora server
  participant P as GPT-5.6 planner
  participant E as Tool preflight
  participant UI as Canvas + captions
  participant V as Realtime voice

  L->>API: Chat / voice / canvas mark
  API->>API: Normalize to canonical student turn
  API->>P: Session history + board layout catalog
  P-->>API: Teaching script (tools + speak + question)
  API->>API: Structural validation (size, refs, final question)
  alt Invalid script
    API->>P: One bounded repair pass
    P-->>API: Revised script
  end
  API->>E: Clone BoardState + run every tool offline
  E-->>API: Verified snapshots OR collision/repair signal
  Note over API,E: Live board is untouched until preflight succeeds
  API->>UI: Sequenced SSE steps (draw → observe → speak)
  UI->>UI: Render authoritative board snapshot
  API->>V: Validated voice_script + verified observation
  V-->>UI: Natural speech + PCM + captions
  UI-->>L: Visual + spoken teaching + diagnostic question
```

### What “clone-only preflight” protects against

- Off-canvas placements
- Broken object references
- Overlapping educational text without an intentional relationship
- Oversized / malformed scripts
- Voice inventing facts that are not on the board

If preflight cannot certify a turn, Mentora refuses to mutate the live canvas and falls back to a safe spoken recovery — **the invalid plan never reaches the learner’s board**.

---

## 4. Board tools and word-level precision

Mentora does not let the model “draw pixels.” It calls a narrow, tested tool set:

| Tool family | Examples | Job |
| --- | --- | --- |
| Structure | `create_shape`, `divide_region`, `place_relative` | Boxes, regions, layout |
| Language | `write_text`, `label_in` | Titles, code, equations |
| Attention | `highlight`, `point_at`, `arrow` | Focus and relationships |
| Edit | `erase_object`, `reset_board` | Clear space for the next idea |

### Word-level text expansion (marking precision)

A whole sentence as one object makes “hello **world**” ambiguous. Mentora expands text deterministically:

```mermaid
flowchart LR
  A["write_text once<br/>package{s}main{n}{t}func{s}main"]
  B[Marked-text parser]
  C[Per-word board objects]
  D[Student circles one word]
  E[Planner sees exact object id]

  A --> B --> C --> D --> E
```

- `{s}` = space, `{n}` = newline, `{t}` = indent (JSON-safe marks)
- One tool call stays easy for the planner
- One word = one board object for the learner
- Circling `func` resolves to that word — not the whole line

This is pedagogy as systems design: **precision of attention requires precision of representation**.

---

## 5. Client reliability contract

```mermaid
flowchart TB
  SSE[SSE event stream] --> Seq{Monotonic sequence?}
  Seq -->|stale / old turn| Drop[Drop event]
  Seq -->|current turn| Apply[Apply server board snapshot]
  Apply --> Wait[Wait for PCM pacing]
  Wait --> Cap[Show caption]
  Cap --> Ready[Accept next learner input]
```

The client is not an optimistic free-draw app during AI turns. It:

- trusts server board snapshots
- rejects stale turn events
- paces UI to spoken audio
- lets the learner interrupt with chat, voice, or canvas marks

---

## 6. Repository map

```mermaid
flowchart TB
  Root[Mentora]
  Root --> Client[client/ — React + Vite lesson UI]
  Root --> Server[server/ — API, planner, voice, sessions]
  Root --> Tools[server/tools/ — deterministic board model]
  Root --> Tests[server/tests/ — golden lessons + safety]
  Root --> Debug[debug/ — terminal planner harness]
  Root --> Data[data/sessions/ — local resume JSON]
```

| Path | Responsibility |
| --- | --- |
| `client/` | Home + lesson UI, canvas, SSE consumer, voice queue |
| `server/src/teaching/` | Planner prompt, script validation, session orchestration |
| `server/tools/` | Board state, ten tools, layout inspection, text layout |
| `server/voice/` | Transcription, Realtime performer, turn playback |
| `server/tests/` | Offline verification + golden lesson regressions |
| `debug/` | Same production schema without the full UI |

Offline gate for judges:

```bash
npm run verify
```

---

## 7. Engineering principles (demo talking points)

1. **Separation of concerns as safety.** Planner ≠ executor ≠ voice.
2. **Clone-only mutation.** Live board changes only after verified snapshots exist.
3. **Narrow tool surface.** Ten tools beat unconstrained diagram generation for trust.
4. **Word-level board text.** Marking precision is implemented in the executor, not hoped for in the prompt.
5. **Fail closed.** Invalid or colliding scripts do not silently corrupt the canvas.
6. **Adaptive loop.** Every turn ends with one diagnostic question; the next turn reuses board + answer context.

---

## 8. End-to-end mental model

```mermaid
flowchart LR
  Stuck[Learner is stuck] --> Show[Shows confusion<br/>voice / text / mark]
  Show --> Plan[GPT-5.6 plans one short turn]
  Plan --> Prove[Tools prove the visual on a clone]
  Prove --> Teach[Realtime teaches the proven board]
  Teach --> Ask[One diagnostic question]
  Ask --> Stuck
```

Mentora’s architecture is not “an LLM that draws.”  
It is a **verified teaching machine**: invent the explanation, build it safely, teach it out loud, check understanding, repeat.
