import {
  cloneBoardState,
  runTool,
  type BoardState,
} from "../../tools/index.js";
import { assertBoardPostconditions } from "../../tools/postconditions.js";
import { inspectBoardEdit } from "../../tools/layoutInspection.js";
import { removeObject } from "../../tools/boardState.js";
import type { TeachingStep } from "./types.js";

export interface PreparationIssue {
  stepIndex: number;
  code:
    | "tool_failed"
    | "board_invalid"
    | "layout_collision"
    | "missing_reference";
  message: string;
}

export interface PreparedTeachingStep {
  index: number;
  step: TeachingStep;
  boardStateAfter: BoardState;
  toolResult?: unknown;
}

export interface PreparedTeachingTurn {
  script: TeachingStep[];
  steps: PreparedTeachingStep[];
  finalBoardState: BoardState;
}

export type PrepareTeachingTurnResult =
  | { ok: true; turn: PreparedTeachingTurn }
  | { ok: false; issues: PreparationIssue[] };

function referencedIds(step: TeachingStep): string[] {
  if (step.kind === "speak") {
    return step.directive.boardObjectIds;
  }
  if (step.kind === "observe") {
    return step.boardObjectIds ?? [];
  }
  return [];
}

export function prepareTeachingTurn(
  script: TeachingStep[],
  initialState: BoardState,
  options: { resolveOccupiedOverlays?: boolean } = {},
): PrepareTeachingTurnResult {
  const workingState = cloneBoardState(initialState);
  const preparedSteps: PreparedTeachingStep[] = [];

  for (let index = 0; index < script.length; index += 1) {
    const step = script[index];
    let toolResult: unknown;

    if (step.kind === "tool") {
      const boardBeforeEdit = cloneBoardState(workingState);
      const outcome = runTool(step.toolName, step.input, workingState);
      if (!outcome.ok) {
        return {
          ok: false,
          issues: [
            {
              stepIndex: index,
              code: "tool_failed",
              message: outcome.error,
            },
          ],
        };
      }
      toolResult = outcome.result;

      const postconditions = assertBoardPostconditions(workingState);
      if (!postconditions.ok) {
        return {
          ok: false,
          issues: [
            {
              stepIndex: index,
              code: "board_invalid",
              message: postconditions.error,
            },
          ],
        };
      }

      let layoutIssues = inspectBoardEdit(
        boardBeforeEdit,
        workingState,
        {
          allowEducationalErasure:
            step.toolName === "erase_object" ||
            step.toolName === "reset_board" ||
            step.toolName === "write_text",
        },
      );

      if (options.resolveOccupiedOverlays && layoutIssues.length > 0) {
        const removableIds = new Set<string>();
        for (const issue of layoutIssues) {
          if (issue.code !== "visual_collision") {
            continue;
          }
          const [changedId, ...occupiedIds] = issue.objectIds;
          for (const occupiedId of occupiedIds) {
            if (occupiedId === changedId) {
              continue;
            }
            const occupied = boardBeforeEdit.objects[occupiedId];
            if (
              occupied &&
              (occupied.kind === "text" ||
                occupied.kind === "label" ||
                occupied.kind === "highlight" ||
                occupied.kind === "pointer")
            ) {
              removableIds.add(occupiedId);
              if (occupied.kind === "text" && occupied.groupId) {
                for (const [id, object] of Object.entries(
                  boardBeforeEdit.objects,
                )) {
                  if (
                    object.kind === "text" &&
                    object.groupId === occupied.groupId
                  ) {
                    removableIds.add(id);
                  }
                }
              }
            }
          }
        }

        for (const objectId of removableIds) {
          if (!workingState.objects[objectId]) {
            continue;
          }
          const next = removeObject(workingState, objectId);
          workingState.objects = next.objects;
          workingState.revision = next.revision;
        }

        if (removableIds.size > 0) {
          layoutIssues = inspectBoardEdit(
            boardBeforeEdit,
            workingState,
            {
              allowEducationalErasure: true,
            },
          );
        }
      }

      if (layoutIssues.length > 0) {
        return {
          ok: false,
          issues: layoutIssues.map((issue) => ({
            stepIndex: index,
            code: "layout_collision" as const,
            message: issue.message,
          })),
        };
      }
    }

    const missingIds = referencedIds(step).filter(
      (id) => !workingState.objects[id],
    );
    if (missingIds.length > 0) {
      return {
        ok: false,
        issues: [
          {
            stepIndex: index,
            code: "missing_reference",
            message: `Missing board object references: ${missingIds.join(", ")}`,
          },
        ],
      };
    }

    preparedSteps.push({
      index,
      step,
      boardStateAfter: cloneBoardState(workingState),
      toolResult,
    });
  }

  return {
    ok: true,
    turn: {
      script,
      steps: preparedSteps,
      finalBoardState: cloneBoardState(workingState),
    },
  };
}
