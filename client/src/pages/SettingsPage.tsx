import {
  usePrefsStore,
  type HintsLevel,
  type MentoraVoice,
  type SpeechSpeed,
  playUiBeep,
} from "../state/prefsStore";

export function SettingsPage() {
  const voice = usePrefsStore((s) => s.voice);
  const speechSpeed = usePrefsStore((s) => s.speechSpeed);
  const hintsLevel = usePrefsStore((s) => s.hintsLevel);
  const soundEffects = usePrefsStore((s) => s.soundEffects);
  const darkMode = usePrefsStore((s) => s.darkMode);
  const setVoice = usePrefsStore((s) => s.setVoice);
  const setSpeechSpeed = usePrefsStore((s) => s.setSpeechSpeed);
  const setHintsLevel = usePrefsStore((s) => s.setHintsLevel);
  const setSoundEffects = usePrefsStore((s) => s.setSoundEffects);
  const setDarkMode = usePrefsStore((s) => s.setDarkMode);

  return (
    <section className="page prefs-page">
      <h1>Preferences</h1>
      <p className="lede">
        These apply to the next lesson start (and theme applies immediately).
      </p>

      <div className="prefs-form">
        <label className="field">
          <span className="field-label">Voice</span>
          <select
            value={voice}
            onChange={(e) => {
              setVoice(e.target.value as MentoraVoice);
              playUiBeep("click");
            }}
          >
            <option value="marin">Marin (Default)</option>
            <option value="cedar">Cedar</option>
            <option value="alloy">Alloy</option>
            <option value="verse">Verse</option>
            <option value="coral">Coral</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Speech speed</span>
          <select
            value={speechSpeed}
            onChange={(e) => setSpeechSpeed(e.target.value as SpeechSpeed)}
          >
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Hints level</span>
          <select
            value={hintsLevel}
            onChange={(e) => setHintsLevel(e.target.value as HintsLevel)}
          >
            <option value="adaptive">Adaptive</option>
            <option value="minimal">Minimal</option>
            <option value="guided">Guided</option>
          </select>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={soundEffects}
            onChange={(e) => {
              setSoundEffects(e.target.checked);
              if (e.target.checked) playUiBeep("ready");
            }}
          />
          <span>Sound effects</span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={darkMode}
            onChange={(e) => setDarkMode(e.target.checked)}
          />
          <span>Dark mode (ink / paper swap)</span>
        </label>
      </div>
    </section>
  );
}
