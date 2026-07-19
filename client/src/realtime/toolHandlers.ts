import {
  BoardApplyActionsArgsSchema,
  type LessonRuntimeState,
  type StudentResponseClassification,
} from "@mentora/shared";
import type { BoardActionQueue } from "../board/ActionQueue";
import { liveBoardSnapshot } from "../board/liveBoardSnapshot";
import { createLessonPlan, replanLesson } from "../api/lessonApi";
import { useTeachingStore } from "../state/teachingStore";
import {
  markStepComplete,
  recordClassification,
  setPhase,
} from "../teaching/teachingStateMachine";

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
      "Continue teaching: ask one check question, then update_lesson_state phase=waiting_for_student.",
  };
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
        tip: "Use free slots / centers from boardMapText, then continue the ask→wait teaching beat.",
        next:
          "Place if needed, then ASK a question and update_lesson_state phase=waiting_for_student.",
      };
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
            "Fix the action batch using boardMapText pixel boxes, then call board_apply_actions again.",
        });
        break;
      }
      const applied = await queue.applyActions(validated.data);
      if (!applied.success) {
        result = withBoardMap(queue, {
          ...applied,
          retryHint:
            "Correct the error using boardMapText. Do not invent missing IDs. Avoid overlapping freeSlots.",
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
          "boardPlan coordinates are pixels on 1100x620. Prefer non-overlapping left diagram + right text zones.",
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
          "Resume teaching from the plan: explain, ask, update_lesson_state waiting_for_student.",
      };
      break;
    }
    case "update_lesson_state": {
      const patch = (args ?? {}) as Partial<LessonRuntimeState> & {
        completedStepId?: string;
        lastClassification?: StudentResponseClassification;
      };
      let runtime = useTeachingStore.getState().runtime;
      const prevHint = runtime.hintLevel;
      if (patch.phase) runtime = setPhase(runtime, patch.phase);
      if (patch.lastClassification) {
        runtime = recordClassification(runtime, patch.lastClassification);
      }
      if (patch.completedStepId) {
        runtime = markStepComplete(runtime, patch.completedStepId);
        const next =
          useTeachingStore.getState().plan.steps[runtime.currentStepIndex];
        if (next?.boardPlan?.length) {
          const drawn = await queue.applyActions({ actions: next.boardPlan });
          console.info("[mentora:board:step]", next.id, drawn);
          runtime = {
            ...runtime,
            boardObjectIds: queue.getRegistry().listIds(),
          };
        }
      }
      runtime = {
        ...runtime,
        ...(typeof patch.currentStepIndex === "number"
          ? { currentStepIndex: patch.currentStepIndex }
          : {}),
        ...(typeof patch.understanding === "number"
          ? { understanding: patch.understanding }
          : {}),
        ...(typeof patch.hintLevel === "number"
          ? { hintLevel: patch.hintLevel }
          : {}),
        ...(typeof patch.wasInterrupted === "boolean"
          ? { wasInterrupted: patch.wasInterrupted }
          : {}),
        ...(typeof patch.questionsAsked === "number"
          ? { questionsAsked: patch.questionsAsked }
          : {}),
      };
      useTeachingStore.getState().setRuntime(runtime);
      if ((patch.hintLevel ?? runtime.hintLevel) > prevHint) {
        useTeachingStore.getState().bumpHints();
      }
      result = { success: true, runtime };
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
