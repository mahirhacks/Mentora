import { create } from "zustand";

export type TranscriptLine = {
  id: string;
  role: "mentora" | "you" | "system";
  text: string;
  at: number;
};

type LessonUiStore = {
  transcript: TranscriptLine[];
  notes: string;
  sidebarTab: "progress" | "transcript" | "notes";
  appendTranscript: (line: Omit<TranscriptLine, "id" | "at"> & { at?: number }) => void;
  appendOrUpdateStreaming: (
    role: TranscriptLine["role"],
    text: string,
    mode?: "append" | "replace",
  ) => void;
  /** Seal the streaming line (optionally replace text). Never adds a second line. */
  finalizeStreaming: (role: TranscriptLine["role"], finalText?: string) => void;
  setNotes: (notes: string) => void;
  setSidebarTab: (tab: LessonUiStore["sidebarTab"]) => void;
  clearLessonUi: () => void;
};

let seq = 0;

/** How long to coalesce fragmented speech into one bubble. */
const COALESCE_MS = 14000;

function norm(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Punctuation-only / empty scraps from cut-off model turns. */
function isJunkTranscript(text: string) {
  const t = text.trim();
  if (!t) return true;
  if (/^[.,!?;:'"…\-–—]+$/.test(t)) return true;
  if (t.length <= 2 && !/[a-z0-9]/i.test(t)) return true;
  return false;
}

function joinUtterance(a: string, b: string): string {
  const left = a.replace(/\s+/g, " ").trim();
  const right = b.replace(/\s+/g, " ").trim();
  if (!left) return right;
  if (!right) return left;
  const nl = norm(left);
  const nr = norm(right);
  if (nr === nl) return left;
  if (nr.startsWith(nl)) return right;
  if (nl.startsWith(nr)) return left;
  if (nl.includes(nr)) return left;
  if (nr.includes(nl) && nr.length > nl.length + 2) return right;
  if (/^[.,!?;:]/.test(right)) return `${left}${right}`;
  return `${left} ${right}`;
}

function isRecentDuplicate(
  list: TranscriptLine[],
  role: TranscriptLine["role"],
  text: string,
  windowMs = COALESCE_MS,
) {
  const needle = norm(text);
  if (!needle) return true;
  const now = Date.now();
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const line = list[i];
    if (now - line.at > windowMs) break;
    if (line.role === role && norm(line.text) === needle) return true;
  }
  return false;
}

function findRecentSameRole(
  list: TranscriptLine[],
  role: TranscriptLine["role"],
  windowMs = COALESCE_MS,
): number {
  const now = Date.now();
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (now - list[i].at > windowMs) break;
    if (list[i].role === role) return i;
  }
  return -1;
}

/** Drop trailing Mentora junk between coalesced YOU fragments. */
function stripTrailingMentoraJunk(list: TranscriptLine[], afterIndex: number) {
  const next = list.slice(0, afterIndex + 1);
  for (let i = afterIndex + 1; i < list.length; i += 1) {
    const line = list[i];
    if (line.role === "mentora") {
      const words = line.text.trim().split(/\s+/).filter(Boolean);
      if (isJunkTranscript(line.text) || words.length <= 2) continue;
    }
    next.push(line);
  }
  return next;
}

export const useLessonUiStore = create<LessonUiStore>((set, get) => ({
  transcript: [],
  notes: "",
  sidebarTab: "progress",
  appendTranscript: (line) => {
    const text = line.text.trim();
    if (!text || isJunkTranscript(text)) return;
    const list = get().transcript;
    if (isRecentDuplicate(list, line.role, text)) return;

    if (line.role === "you" || line.role === "mentora") {
      const idx = findRecentSameRole(list, line.role);
      if (idx >= 0) {
        const prev = list[idx];
        const merged = joinUtterance(prev.text, text);
        if (norm(merged) === norm(prev.text)) return;
        const next = [...list];
        next[idx] = { ...prev, text: merged, at: Date.now() };
        set({
          transcript:
            line.role === "you" ? stripTrailingMentoraJunk(next, idx) : next,
        });
        return;
      }
    }

    set({
      transcript: [
        ...list,
        {
          id: `t_${++seq}`,
          at: line.at ?? Date.now(),
          role: line.role,
          text,
        },
      ],
    });
  },
  appendOrUpdateStreaming: (role, text, mode = "append") => {
    const chunk = text;
    if (!chunk) return;
    if (mode !== "replace" && isJunkTranscript(chunk) && chunk.trim().length < 8) {
      return;
    }
    const list = get().transcript;

    // Continue an open stream for this role even if another role spoke in between.
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const line = list[i];
      if (!line.id.endsWith("_stream")) continue;
      if (line.role !== role) continue;
      const nextText = mode === "replace" ? chunk : joinUtterance(line.text, chunk);
      if (nextText === line.text) return;
      const next = [...list];
      next[i] = { ...line, text: nextText, at: Date.now() };
      set({ transcript: next });
      return;
    }

    // Merge into a recent sealed line of the same role (fragmented VAD commits).
    const idx = findRecentSameRole(list, role);
    if (idx >= 0 && Date.now() - list[idx].at < COALESCE_MS) {
      const prev = list[idx];
      const merged =
        mode === "replace" && norm(chunk).startsWith(norm(prev.text))
          ? chunk.trim()
          : joinUtterance(prev.text, chunk);
      if (norm(merged) === norm(prev.text)) return;
      const next = [...list];
      next[idx] = {
        ...prev,
        id: `${prev.id.endsWith("_stream") ? prev.id : `t_${++seq}_stream`}`,
        text: merged,
        at: Date.now(),
      };
      // Ensure stream suffix for continued updates
      if (!next[idx].id.endsWith("_stream")) {
        next[idx] = { ...next[idx], id: `t_${++seq}_stream` };
      }
      set({ transcript: next });
      return;
    }

    if (mode === "replace" && isRecentDuplicate(list, role, chunk)) return;
    set({
      transcript: [
        ...list,
        {
          id: `t_${++seq}_stream`,
          role,
          text: chunk.trim(),
          at: Date.now(),
        },
      ],
    });
  },
  finalizeStreaming: (role, finalText) => {
    const raw = (finalText ?? "").trim();
    if (raw && isJunkTranscript(raw)) {
      // Drop open junk stream
      const list = get().transcript;
      const last = list[list.length - 1];
      if (last?.role === role && last.id.endsWith("_stream") && isJunkTranscript(last.text)) {
        set({ transcript: list.slice(0, -1) });
      }
      return;
    }

    const list = get().transcript;

    // Finalize open stream for this role (may not be last).
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const line = list[i];
      if (line.role !== role || !line.id.endsWith("_stream")) continue;
      const text = (raw || line.text).trim();
      if (!text) {
        set({ transcript: [...list.slice(0, i), ...list.slice(i + 1)] });
        return;
      }
      const without = [...list.slice(0, i), ...list.slice(i + 1)];
      // Merge into earlier sealed same-role line if recent.
      const prevIdx = findRecentSameRole(without, role);
      if (prevIdx >= 0) {
        const prev = without[prevIdx];
        const merged = joinUtterance(prev.text, text);
        if (isRecentDuplicate(without.filter((_, j) => j !== prevIdx), role, merged)) {
          set({
            transcript:
              role === "you"
                ? stripTrailingMentoraJunk(without, prevIdx)
                : without,
          });
          return;
        }
        const next = [...without];
        next[prevIdx] = { ...prev, text: merged, at: Date.now() };
        set({
          transcript:
            role === "you" ? stripTrailingMentoraJunk(next, prevIdx) : next,
        });
        return;
      }
      if (isRecentDuplicate(without, role, text)) {
        set({ transcript: without });
        return;
      }
      const sealed = { ...line, id: `t_${++seq}`, text, at: Date.now() };
      const next = [...without.slice(0, i), sealed, ...without.slice(i)];
      set({ transcript: next });
      return;
    }

    const text = raw;
    if (!text) return;
    if (isRecentDuplicate(list, role, text)) return;

    const prevIdx = findRecentSameRole(list, role);
    if (prevIdx >= 0) {
      const prev = list[prevIdx];
      const merged = joinUtterance(prev.text, text);
      const next = [...list];
      next[prevIdx] = { ...prev, text: merged, at: Date.now() };
      set({
        transcript:
          role === "you" ? stripTrailingMentoraJunk(next, prevIdx) : next,
      });
      return;
    }

    set({
      transcript: [
        ...list,
        {
          id: `t_${++seq}`,
          role,
          text,
          at: Date.now(),
        },
      ],
    });
  },
  setNotes: (notes) => set({ notes }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  clearLessonUi: () =>
    set({ transcript: [], notes: get().notes, sidebarTab: "progress" }),
}));
