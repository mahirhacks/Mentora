import {
  BoardActionSchema,
  BoardApplyActionsArgsSchema,
  type BoardAction,
  type BoardApplyActionsResult,
} from "@mentora/shared";
import {
  BoardActionExecutor,
  notFoundResult,
} from "./ActionExecutor";
import type { BoardObjectRegistry } from "./ObjectRegistry";

type QueueItem = {
  actions: BoardAction[];
  resolve: (result: BoardApplyActionsResult) => void;
};

/**
 * Sequential mutation queue. Focus actions start immediately and do not
 * block the queue for their hold duration.
 */
export class BoardActionQueue {
  private queue: QueueItem[] = [];
  private running = false;
  private cancelled = false;
  private executor: BoardActionExecutor;
  private registry: BoardObjectRegistry;

  constructor(
    registry: BoardObjectRegistry,
    hooks: ConstructorParameters<typeof BoardActionExecutor>[1],
  ) {
    this.registry = registry;
    this.executor = new BoardActionExecutor(registry, hooks);
  }

  getRegistry(): BoardObjectRegistry {
    return this.registry;
  }

  getExecutor(): BoardActionExecutor {
    return this.executor;
  }

  /** Drop unstarted queued batches (interrupt). In-flight batch finishes current action. */
  interruptDropPending(): void {
    const dropped = this.queue.splice(0);
    for (const item of dropped) {
      item.resolve({
        success: false,
        applied: [],
        error: "INTERRUPTED",
        issues: ["Unstarted board actions dropped on interrupt"],
      });
    }
  }

  applyActions(raw: unknown): Promise<BoardApplyActionsResult> {
    const parsed = BoardApplyActionsArgsSchema.safeParse(raw);
    if (!parsed.success) {
      return Promise.resolve({
        success: false,
        applied: [],
        error: "VALIDATION_ERROR",
        issues: parsed.error.issues.map(
          (i) => `${i.path.join(".")}: ${i.message}`,
        ),
      });
    }

    // Reject unknown / invalid individual actions with Zod before any execution
    const actions: BoardAction[] = [];
    for (const action of parsed.data.actions) {
      const one = BoardActionSchema.safeParse(action);
      if (!one.success) {
        return Promise.resolve({
          success: false,
          applied: [],
          error: "VALIDATION_ERROR",
          issues: one.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        });
      }
      actions.push(one.data);
    }

    const seen = new Set<string>();
    for (const action of actions) {
      const createsId =
        action.type.startsWith("draw_") ||
        action.type === "write_text" ||
        action.type === "write_equation";
      if (createsId && "objectId" in action) {
        const id = action.objectId;
        if (seen.has(id)) {
          return Promise.resolve({
            success: false,
            applied: [],
            error: "DUPLICATE_ID",
            objectId: id,
            issues: [`Duplicate objectId in batch: ${id}`],
          });
        }
        seen.add(id);
      }
    }

    return new Promise((resolve) => {
      this.queue.push({ actions, resolve });
      void this.pump();
    });
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      const applied: string[] = [];
      try {
        for (const action of item.actions) {
          if (this.cancelled) break;
          const label = action.type;
          // Focus actions return immediately (hold TTL is async); still await
          // so OBJECT_NOT_FOUND and other sync failures are caught here.
          await this.executor.executeOne(action);
          applied.push(label);
        }
        item.resolve({ success: true, applied });
      } catch (err) {
        const e = err as {
          code?: string;
          objectId?: string;
          availableObjectIds?: string[];
          message?: string;
        };
        if (e.code === "OBJECT_NOT_FOUND" && e.objectId) {
          item.resolve(
            notFoundResult(e.objectId, e.availableObjectIds ?? []),
          );
        } else if (String(e.message ?? "").startsWith("DUPLICATE_ID:")) {
          item.resolve({
            success: false,
            applied,
            error: "DUPLICATE_ID",
            objectId: String(e.message).split(":")[1],
          });
        } else {
          item.resolve({
            success: false,
            applied,
            error: "EXECUTION_ERROR",
            issues: [e.message ?? String(err)],
          });
        }
      }
    }

    this.running = false;
  }
}
