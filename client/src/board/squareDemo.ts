import type { BoardAction } from "@mentora/shared";
import { squareFormulaBoardActions as sharedSquareActions } from "@mentora/shared";

/** Hard-coded square-formula board sequence (declarative layout → pixels). */
export function squareFormulaBoardActions(): BoardAction[] {
  return sharedSquareActions();
}
