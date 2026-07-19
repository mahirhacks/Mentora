import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MentoraVoice = "marin" | "cedar" | "alloy" | "verse" | "coral";
export type SpeechSpeed = "slow" | "normal" | "fast";
export type HintsLevel = "adaptive" | "minimal" | "guided";

type PrefsStore = {
  voice: MentoraVoice;
  speechSpeed: SpeechSpeed;
  hintsLevel: HintsLevel;
  soundEffects: boolean;
  darkMode: boolean;
  setVoice: (voice: MentoraVoice) => void;
  setSpeechSpeed: (speechSpeed: SpeechSpeed) => void;
  setHintsLevel: (hintsLevel: HintsLevel) => void;
  setSoundEffects: (soundEffects: boolean) => void;
  setDarkMode: (darkMode: boolean) => void;
};

export const SPEED_TO_NUMBER: Record<SpeechSpeed, number> = {
  slow: 0.85,
  normal: 1,
  fast: 1.2,
};

export const HINTS_TO_DELAY_MS: Record<HintsLevel, number> = {
  minimal: 16000,
  adaptive: 10000,
  guided: 6000,
};

export function applyTheme(darkMode: boolean) {
  document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  // Always keep document root on paper/ink dual tone
  document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
}

export const usePrefsStore = create<PrefsStore>()(
  persist(
    (set) => ({
      voice: "marin",
      speechSpeed: "normal",
      hintsLevel: "adaptive",
      soundEffects: true,
      darkMode: false,
      setVoice: (voice) => set({ voice }),
      setSpeechSpeed: (speechSpeed) => set({ speechSpeed }),
      setHintsLevel: (hintsLevel) => set({ hintsLevel }),
      setSoundEffects: (soundEffects) => set({ soundEffects }),
      setDarkMode: (darkMode) => {
        applyTheme(darkMode);
        set({ darkMode });
      },
    }),
    {
      name: "mentora-prefs-v2",
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.darkMode);
      },
    },
  ),
);

/** Tiny UI click / status beep when sound effects are on. */
export function playUiBeep(kind: "click" | "ready" | "done" = "click") {
  if (!usePrefsStore.getState().soundEffects) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const freq = kind === "done" ? 660 : kind === "ready" ? 520 : 440;
    osc.frequency.value = freq;
    gain.gain.value = 0.04;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.stop(ctx.currentTime + 0.13);
    void ctx.close();
  } catch {
    // ignore autoplay / AudioContext failures
  }
}
