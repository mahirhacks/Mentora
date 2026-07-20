import {
  BoardApplyActionsArgsSchema,
  BoardDiagramArgsSchema,
  BoardPlaceArgsSchema,
  compileDiagramOps,
  type DiagramBox,
} from "@mentora/shared";
import type { BoardActionQueue } from "../board/ActionQueue";
import {
  buildZonePlacement,
  eraseActionsForZone,
} from "../board/boardLayoutEngine";
import { objectPixelBox } from "../board/boardSpatialMap";
import { liveBoardSnapshot } from "../board/liveBoardSnapshot";
import { createLessonPlan, replanLesson } from "../api/lessonApi";
import { useTeachingStore } from "../state/teachingStore";
import { useLessonUiStore } from "../state/lessonUiStore";

export type ToolCall = {
  call_id: string;
  name: string;
  arguments: string;
};

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** True if Mentora already spoke a real check question (not just "let me ask…"). */
export function mentoraHasSpokenQuestion(): boolean {
  const lines = useLessonUiStore.getState().transcript;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.role !== "mentora") continue;
    const t = line.text.trim();
    if (!t) continue;
    const promisesOnly =
      /\b(let me ask|i('ll| will) ask|quick question to get (us|you) going|ask you a quick question)\b/i.test(
        t,
      ) && !/[?]/.test(t);
    if (promisesOnly) return false;
    if (/[?]/.test(t)) return true;
    if (
      /\b(what do you|how (would|do|can|might) you|why (do|is|are|would)|where (is|are|do)|which|do you (know|remember|see|think)|can you|could you|have you|tell me what)\b/i.test(
        t,
      )
    ) {
      return true;
    }
    return false;
  }
  return false;
}

function withBoardMap(
  queue: BoardActionQueue,
  result: Record<string, unknown>,
): Record<string, unknown> {
  // Text-only map — keep tool payloads small so the teaching loop does not stall.
  const { text } = liveBoardSnapshot(queue.getRegistry());
  return {
    ...result,
    boardMapText: text,
    next:
      "Speak your check question out loud now (include the real question), then stop and wait. Do not keep drawing. Do not apologize. Do not call tools.",
  };
}

function registryBoxes(queue: BoardActionQueue): Record<string, DiagramBox> {
  const out: Record<string, DiagramBox> = {};
  for (const obj of queue.getRegistry().list()) {
    out[obj.id] = objectPixelBox(obj);
  }
  return out;
}

export async function handleToolCall(
  call: ToolCall,
  queue: BoardActionQueue,
): Promise<{ call_id: string; output: string }> {
  const args = parseArgs(call.arguments);
  let result: unknown;

  switch (call.name) {
    case "get_board_layout": {
      const { text } = liveBoardSnapshot(queue.getRegistry());
      result = {
        success: true,
        boardMapText: text,
        tip: "Prefer board_diagram for diagrams and board_place for prose. Refer to shapes by objectId — do not invent pixel x/y.",
        next:
          "Speak a check question out loud, then stop and wait. Prefer voice over more board tools. Do not call tools.",
      };
      break;
    }
    case "board_place": {
      const validated = BoardPlaceArgsSchema.safeParse(args);
      if (!validated.success) {
        result = withBoardMap(queue, {
          success: false,
          applied: [],
          error: "VALIDATION_ERROR",
          issues: validated.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
          retryHint:
            "board_place needs zone (title|left|right|bottom) and blocks with kind heading|body|bullets|callout.",
        });
        break;
      }
      const { zone, clearZone, blocks } = validated.data;
      const prelude = clearZone
        ? eraseActionsForZone(queue.getRegistry(), zone)
        : [];
      const placed = buildZonePlacement({ zone, blocks });
      if (!placed.length) {
        result = withBoardMap(queue, {
          success: false,
          applied: [],
          error: "EMPTY_PLACEMENT",
          issues: ["No actions generated for this zone/blocks combination"],
        });
        break;
      }
      const applied = await queue.applyActions({
        actions: [...prelude, ...placed],
      });
      if (!applied.success) {
        result = withBoardMap(queue, {
          ...applied,
          retryHint:
            "Fix IDs or shorten text, then retry board_place. Prefer clearZone when replacing a zone.",
        });
      } else {
        useTeachingStore.getState().patchRuntime({
          boardObjectIds: queue.getRegistry().listIds(),
        });
        result = withBoardMap(queue, {
          ...applied,
          zone,
          placedBlocks: blocks.length,
        });
      }
      break;
    }
    case "board_diagram": {
      const validated = BoardDiagramArgsSchema.safeParse(args);
      if (!validated.success) {
        result = withBoardMap(queue, {
          success: false,
          applied: [],
          error: "VALIDATION_ERROR",
          issues: validated.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
          retryHint:
            "board_diagram needs ops[] with create_shape|divide_region|label_in|place_relative|point_at|highlight|pause. No pixel coordinates.",
        });
        break;
      }
      try {
        const { actions } = compileDiagramOps(
          validated.data.ops,
          registryBoxes(queue),
        );
        if (!actions.length) {
          result = withBoardMap(queue, {
            success: false,
            applied: [],
            error: "EMPTY_DIAGRAM",
            issues: ["No actions generated from these ops"],
          });
          break;
        }
        const applied = await queue.applyActions({ actions });
        if (!applied.success) {
          result = withBoardMap(queue, {
            ...applied,
            retryHint:
              "Fix unknown objectIds via get_board_layout, then retry board_diagram. Prefer create_shape then divide_region on that id.",
          });
        } else {
          useTeachingStore.getState().patchRuntime({
            boardObjectIds: queue.getRegistry().listIds(),
          });
          result = withBoardMap(queue, {
            ...applied,
            opsApplied: validated.data.ops.length,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const parentId = message.startsWith("DIAGRAM_UNKNOWN_PARENT:")
          ? message.slice("DIAGRAM_UNKNOWN_PARENT:".length)
          : undefined;
        result = withBoardMap(queue, {
          success: false,
          applied: [],
          error: "DIAGRAM_COMPILE_ERROR",
          objectId: parentId,
          availableObjectIds: queue.getRegistry().listIds(),
          issues: [message],
          retryHint: parentId
            ? `Unknown parent "${parentId}". create_shape it first, or pick an id from availableObjectIds.`
            : "Simplify ops; use create_shape → divide_region → point_at by id.",
        });
      }
      break;
    }
    case "board_apply_actions": {
      const validated = BoardApplyActionsArgsSchema.safeParse(args);
      if (!validated.success) {
        result = withBoardMap(queue, {
          success: false,
          applied: [],
          error: "VALIDATION_ERROR",
          issues: validated.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
          retryHint:
            "Prefer board_diagram instead of pixel batches. If retrying, fix action types using boardMapText objectIds.",
        });
        break;
      }
      const applied = await queue.applyActions(validated.data);
      if (!applied.success) {
        result = withBoardMap(queue, {
          ...applied,
          retryHint:
            "Correct the error using objectIds from boardMapText. Prefer board_diagram for new shapes.",
        });
      } else {
        useTeachingStore.getState().patchRuntime({
          boardObjectIds: queue.getRegistry().listIds(),
        });
        result = withBoardMap(queue, { ...applied });
      }
      break;
    }
    case "create_lesson_plan": {
      const topic =
        typeof args === "object" && args && "topic" in args
          ? String((args as { topic: string }).topic)
          : useTeachingStore.getState().topicRequest || "new topic";
      const studentRequest =
        typeof args === "object" && args && "studentRequest" in args
          ? String((args as { studentRequest?: string }).studentRequest ?? "")
          : undefined;
      const demoSafeMode = import.meta.env.VITE_DEMO_SAFE_MODE === "true";
      useTeachingStore.getState().patchRuntime({ phase: "planning" });
      const planned = await createLessonPlan({
        topic,
        studentRequest,
        demoSafeMode,
      });
      useTeachingStore.getState().setPlan(planned.plan, planned.source);
      useTeachingStore.getState().patchRuntime({
        phase: "teaching",
        planTitle: planned.plan.title,
        currentStepIndex: 0,
      });
      result = {
        success: true,
        source: planned.source,
        plan: {
          title: planned.plan.title,
          topic: planned.plan.topic,
          objectives: planned.plan.objectives,
          steps: planned.plan.steps.map((s) => ({
            id: s.id,
            title: s.title,
            strategy: s.strategy,
            checkQuestion: s.checkQuestion,
            acceptedAnswers: s.acceptedAnswers,
            hintLadder: s.hintLadder,
            fallbackExplanation: s.fallbackExplanation,
            boardPlan: s.boardPlan,
          })),
          finalAssessment: planned.plan.finalAssessment,
          masteryCriteria: planned.plan.masteryCriteria,
          misconceptions: planned.plan.misconceptions,
          prerequisites: planned.plan.prerequisites,
        },
        error: planned.error,
        layoutNote:
          "Prefer board_place for prose and board_diagram for shapes (no pixel x/y). board_apply_actions is escape hatch only.",
      };
      break;
    }
    case "replan_lesson": {
      const reason =
        typeof args === "object" && args && "reason" in args
          ? String((args as { reason: string }).reason)
          : "student confusion";
      const { plan, runtime } = useTeachingStore.getState();
      const replanned = await replanLesson({
        reason,
        currentPlan: plan,
        completedStepIds: runtime.completedStepIds,
      });
      useTeachingStore.getState().setPlan(replanned.plan, replanned.source);
      result = {
        success: true,
        source: replanned.source,
        plan: replanned.plan,
        boardMapText: liveBoardSnapshot(queue.getRegistry()).text,
        next:
          "Resume teaching from the plan: speak a check question out loud, then stop and wait.",
      };
      break;
    }
    case "update_lesson_state": {
      // Decide-then-voice: client owns phases via TurnGate response.done.
      result = {
        success: false,
        error: "CLIENT_OWNS_PHASE",
        runtime: useTeachingStore.getState().runtime,
        issues: [
          "Do not call update_lesson_state. Speak your question, then stop — the client sets waiting_for_student.",
        ],
        next: "Speak only. Do not call tools.",
      };
      break;
    }
    case "complete_lesson": {
      const mastered =
        typeof args === "object" && args && "mastered" in args
          ? Boolean((args as { mastered: boolean }).mastered)
          : false;
      const understanding =
        typeof args === "object" && args && "understanding" in args
          ? Number((args as { understanding?: number }).understanding ?? 0.8)
          : useTeachingStore.getState().runtime.understanding;
      useTeachingStore.getState().patchRuntime({
        phase: "complete",
        understanding,
        completedAt: Date.now(),
      });
      result = {
        success: true,
        mastered,
        understanding,
        summary:
          typeof args === "object" && args && "summary" in args
            ? String((args as { summary?: string }).summary ?? "")
            : "",
      };
      break;
    }
    default:
      result = {
        success: false,
        error: "UNKNOWN_TOOL",
        issues: [`Unknown tool: ${call.name}`],
      };
  }

  return { call_id: call.call_id, output: JSON.stringify(result) };
}
