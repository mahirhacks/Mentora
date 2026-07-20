export type TurnPhase =
  | "idle"
  | "transcribing"
  | "planning"
  | "drawing"
  | "speaking"
  | "recoverable_error";

export interface TurnState {
  phase: TurnPhase;
  activeToolName: string | null;
  error: string | null;
  recoverable: boolean;
}

export type TurnAction =
  | { type: "transcribing" }
  | { type: "planning" }
  | { type: "drawing"; toolName: string }
  | { type: "tool_complete" }
  | { type: "speaking" }
  | { type: "ready" }
  | { type: "error"; message: string; recoverable?: boolean };

export const initialTurnState: TurnState = {
  phase: "idle",
  activeToolName: null,
  error: null,
  recoverable: false,
};

export function turnReducer(
  state: TurnState,
  action: TurnAction,
): TurnState {
  switch (action.type) {
    case "transcribing":
      return { ...initialTurnState, phase: "transcribing" };
    case "planning":
      return { ...initialTurnState, phase: "planning" };
    case "drawing":
      return {
        ...state,
        phase: "drawing",
        activeToolName: action.toolName,
        error: null,
        recoverable: false,
      };
    case "tool_complete":
      return {
        ...state,
        activeToolName: null,
      };
    case "speaking":
      return {
        ...state,
        phase: "speaking",
        activeToolName: null,
      };
    case "ready":
      return initialTurnState;
    case "error":
      return {
        phase: "recoverable_error",
        activeToolName: null,
        error: action.message,
        recoverable: action.recoverable ?? false,
      };
  }
}

export function isTurnActive(phase: TurnPhase) {
  return (
    phase === "transcribing" ||
    phase === "planning" ||
    phase === "drawing" ||
    phase === "speaking"
  );
}
