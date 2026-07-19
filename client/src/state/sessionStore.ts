import { create } from "zustand";
import type {
  RealtimeConnectionState,
  VoiceUiState,
} from "../realtime/RealtimeClient";

type SessionStore = {
  connection: RealtimeConnectionState;
  voiceUi: VoiceUiState;
  muted: boolean;
  error: string | null;
  setConnection: (connection: RealtimeConnectionState) => void;
  setVoiceUi: (voiceUi: VoiceUiState) => void;
  setMuted: (muted: boolean) => void;
  setError: (error: string | null) => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  connection: "idle",
  voiceUi: "idle",
  muted: false,
  error: null,
  setConnection: (connection) => set({ connection }),
  setVoiceUi: (voiceUi) => set({ voiceUi }),
  setMuted: (muted) => set({ muted }),
  setError: (error) => set({ error }),
}));
