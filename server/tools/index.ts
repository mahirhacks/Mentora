import { createBoardState } from "./boardState.js";
import { createShapeTool } from "./createShape.js";
import { divideRegionTool } from "./divideRegion.js";
import { eraseObjectTool } from "./eraseObject.js";
import { highlightTool } from "./highlight.js";
import { labelInTool } from "./labelIn.js";
import { placeRelativeTool } from "./placeRelative.js";
import { pointAtTool } from "./pointAt.js";
import { resetBoardTool } from "./resetBoard.js";
import { writeTextTool } from "./writeText.js";
import type { BoardState, ToolDefinition, ToolRunOutcome } from "./types.js";

export const boardTools = [
  createShapeTool,
  divideRegionTool,
  labelInTool,
  placeRelativeTool,
  highlightTool,
  pointAtTool,
  writeTextTool,
  eraseObjectTool,
  resetBoardTool,
] as const;

export type BoardToolName = (typeof boardTools)[number]["name"];

const toolMap = new Map<string, ToolDefinition>(
  boardTools.map((tool) => [tool.name, tool as ToolDefinition]),
);

export function getTool(name: string): ToolDefinition | undefined {
  return toolMap.get(name);
}

export function listTools(): ToolDefinition[] {
  return [...toolMap.values()];
}

export function runTool(
  name: string,
  input: unknown,
  state: BoardState = createBoardState(),
): ToolRunOutcome<unknown> {
  const tool = getTool(name);
  if (!tool) {
    return {
      ok: false,
      error: `Unknown tool: ${name}`,
      state,
    };
  }

  try {
    const result = tool.execute(input, state);
    return {
      ok: true,
      result,
      state,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      state,
    };
  }
}

export * from "./types.js";
export * from "./boardState.js";
export {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  buildBoardLayoutCatalog,
  formatBoardLayoutForPrompt,
  formatBoardStateForPrompt,
} from "./boardLayout.js";
export {
  boundsOverlap,
  clearOverlappingBeforePlace,
} from "./placementGuard.js";
export { createShapeTool } from "./createShape.js";
export { divideRegionTool } from "./divideRegion.js";
export { labelInTool } from "./labelIn.js";
export { placeRelativeTool } from "./placeRelative.js";
export { highlightTool } from "./highlight.js";
export { pointAtTool } from "./pointAt.js";
export { writeTextTool } from "./writeText.js";
export { eraseObjectTool } from "./eraseObject.js";
export { resetBoardTool } from "./resetBoard.js";
