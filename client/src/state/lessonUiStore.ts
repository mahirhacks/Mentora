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
  appendOrUpdateStreaming: (role: TranscriptLine["role"], text: string) => void;
  finalizeStreaming: (role: TranscriptLine["role"]) => void;
  setNotes: (notes: string) => void;
  setSidebarTab: (tab: LessonUiStore["sidebarTab"]) => void;
  clearLessonUi: () => void;
};

let seq = 0;

export const useLessonUiStore = create<LessonUiStore>((set, get) => ({
  transcript: [],
  notes: "",
  sidebarTab: "progress",
  appendTranscript: (line) =>
    set({
      transcript: [
        ...get().transcript,
        {
          id: `t_${++seq}`,
          at: line.at ?? Date.now(),
          role: line.role,
          text: line.text,
        },
      ],
    }),
  appendOrUpdateStreaming: (role, text) => {
    const list = get().transcript;
    const last = list[list.length - 1];
    if (last && last.role === role && last.id.endsWith("_stream")) {
      set({
        transcript: [
          ...list.slice(0, -1),
          { ...last, text: last.text + text },
        ],
      });
      return;
    }
    set({
      transcript: [
        ...list,
        {
          id: `t_${++seq}_stream`,
          role,
          text,
          at: Date.now(),
        },
      ],
    });
  },
  finalizeStreaming: (role) => {
    const list = get().transcript;
    const last = list[list.length - 1];
    if (last && last.role === role && last.id.endsWith("_stream")) {
      set({
        transcript: [
          ...list.slice(0, -1),
          { ...last, id: `t_${++seq}` },
        ],
      });
    }
  },
  setNotes: (notes) => set({ notes }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  clearLessonUi: () =>
    set({ transcript: [], notes: get().notes, sidebarTab: "progress" }),
}));
