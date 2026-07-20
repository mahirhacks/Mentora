import { useSessionStore } from "../state/sessionStore";
import { useTeachingStore } from "../state/teachingStore";
import type { VoiceUiState } from "../realtime/RealtimeClient";

type Activity = {
  speaking: boolean;
  drawing: boolean;
  thinking: boolean;
};

let activity: Activity = {
  speaking: false,
  drawing: false,
  thinking: false,
};

/** Derive and publish the single VoiceUiState from activity + lesson phase. */
export function publishVoiceUi() {
  const phase = useTeachingStore.getState().runtime.phase;
  let next: VoiceUiState;
  if (activity.speaking) next = "speaking";
  else if (activity.drawing) next = "drawing";
  else if (activity.thinking) next = "thinking";
  else if (phase === "waiting_for_student") next = "waiting";
  else next = "listening";
  useSessionStore.getState().setVoiceUi(next);
}

export function setVoiceActivity(patch: Partial<Activity>) {
  activity = { ...activity, ...patch };
  publishVoiceUi();
}

export function resetVoiceActivity() {
  activity = { speaking: false, drawing: false, thinking: false };
  publishVoiceUi();
}

export function voiceStatusLabel(ui: VoiceUiState): string {
  switch (ui) {
    case "speaking":
      return "AI speaking";
    case "drawing":
      return "AI drawing";
    case "thinking":
      return "AI thinking";
    case "listening":
      return "AI listening";
    case "waiting":
      return "Waiting for you";
    default:
      return "Ready";
  }
}

export function isBoardTool(name: string): boolean {
  return (
    name === "board_place" ||
    name === "board_diagram" ||
    name === "board_apply_actions" ||
    name === "get_board_layout"
  );
}

const FOCUS_ACTION_TYPES = new Set([
  "point_at",
  "highlight",
  "show_pointer",
  "clear_focus",
  "pause",
]);

const FOCUS_DIAGRAM_OPS = new Set(["point_at", "highlight", "pause"]);

/**
 * True when a board tool only moves the teaching pointer / highlight —
 * safe to run under live speech without forcing a CONTINUE_AFTER_TOOLS turn.
 */
export function isFocusOnlyBoardTool(name: string, argsRaw: string): boolean {
  if (name === "get_board_layout") return true;
  if (name === "board_place") return false;
  try {
    const args = JSON.parse(argsRaw) as Record<string, unknown>;
    if (name === "board_diagram") {
      const ops = Array.isArray(args.ops) ? args.ops : [];
      if (!ops.length) return false;
      return ops.every(
        (op) =>
          op &&
          typeof op === "object" &&
          FOCUS_DIAGRAM_OPS.has(String((op as { op?: string }).op ?? "")),
      );
    }
    if (name === "board_apply_actions") {
      const actions = Array.isArray(args.actions) ? args.actions : [];
      if (!actions.length) return false;
      return actions.every(
        (a) =>
          a &&
          typeof a === "object" &&
          FOCUS_ACTION_TYPES.has(String((a as { type?: string }).type ?? "")),
      );
    }
  } catch {
    return false;
  }
  return false;
}
