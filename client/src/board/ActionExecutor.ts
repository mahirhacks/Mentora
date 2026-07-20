import type { BoardAction, BoardApplyActionsResult } from "@mentora/shared";
import { isBlockingAction } from "@mentora/shared";
import type { BoardObjectRegistry } from "./ObjectRegistry";

export type FocusState = {
  kind: "point" | "highlight" | null;
  objectId: string | null;
  /** Absolute pixel position when set (show_pointer or resolved point_at). */
  x: number | null;
  y: number | null;
  color?: string;
  until: number;
};

export type ExecutorHooks = {
  onRegistryChange: () => void;
  onFocusChange: (focus: FocusState) => void;
  onClearStudentLayer: () => void;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class BoardActionExecutor {
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private focus: FocusState = {
    kind: null,
    objectId: null,
    x: null,
    y: null,
    until: 0,
  };
  private author: "ai" | "student" = "ai";

  constructor(
    private registry: BoardObjectRegistry,
    private hooks: ExecutorHooks,
  ) {}

  setAuthor(author: "ai" | "student") {
    this.author = author;
  }

  getFocus(): FocusState {
    return this.focus;
  }

  async executeOne(action: BoardAction): Promise<void> {
    const layer = this.author;
    switch (action.type) {
      case "draw_rectangle":
        this.registry.add({
          id: action.objectId,
          type: "rectangle",
          x: action.x,
          y: action.y,
          width: action.width,
          height: action.height,
          stroke: action.stroke ?? "#164e3b",
          fill: action.fill ?? "rgba(22,78,59,0.06)",
          strokeWidth: action.strokeWidth ?? 3,
          text: action.label,
          visible: true,
          layer,
        });
        this.hooks.onRegistryChange();
        await this.tween(450);
        break;
      case "draw_circle":
        this.registry.add({
          id: action.objectId,
          type: "circle",
          x: action.x,
          y: action.y,
          radius: action.radius,
          stroke: action.stroke ?? "#164e3b",
          fill: action.fill ?? "rgba(22,78,59,0.06)",
          strokeWidth: action.strokeWidth ?? 3,
          visible: true,
          layer,
        });
        this.hooks.onRegistryChange();
        await this.tween(400);
        break;
      case "draw_line":
        this.registry.add({
          id: action.objectId,
          type: "line",
          x: action.points[0] ?? 0,
          y: action.points[1] ?? 0,
          points: action.points,
          stroke: action.stroke ?? "#164e3b",
          strokeWidth: action.strokeWidth ?? 2,
          visible: true,
          layer,
        });
        this.hooks.onRegistryChange();
        await this.tween(350);
        break;
      case "draw_arrow":
        this.registry.add({
          id: action.objectId,
          type: "arrow",
          x: action.points[0] ?? 0,
          y: action.points[1] ?? 0,
          points: action.points,
          stroke: action.stroke ?? "#164e3b",
          strokeWidth: action.strokeWidth ?? 3,
          visible: true,
          layer,
        });
        this.hooks.onRegistryChange();
        await this.tween(350);
        break;
      case "write_text":
        this.registry.add({
          id: action.objectId,
          type: "text",
          x: action.x,
          y: action.y,
          text: action.text,
          fontSize: action.fontSize ?? 22,
          fill: action.fill ?? "#164e3b",
          visible: true,
          layer,
        });
        this.hooks.onRegistryChange();
        await this.tween(300);
        break;
      case "write_equation":
        this.registry.add({
          id: action.objectId,
          type: "equation",
          x: action.x,
          y: action.y,
          latex: action.latex,
          fontSize: action.fontSize ?? 28,
          fill: action.fill ?? "#164e3b",
          visible: true,
          layer,
        });
        this.hooks.onRegistryChange();
        await this.tween(400);
        break;
      case "move_object":
        this.require(action.objectId);
        this.registry.update(action.objectId, { x: action.x, y: action.y });
        this.hooks.onRegistryChange();
        await this.tween(300);
        break;
      case "erase_object":
        this.require(action.objectId);
        this.registry.erase(action.objectId);
        this.hooks.onRegistryChange();
        await this.tween(200);
        break;
      case "clear_board":
        this.registry.clear();
        this.clearFocusImmediate();
        this.hooks.onRegistryChange();
        await this.tween(200);
        break;
      case "clear_student_layer":
        this.hooks.onClearStudentLayer();
        await this.tween(150);
        break;
      case "pause":
        await this.sleep(action.ms);
        break;
      case "point_at": {
        this.require(action.objectId);
        const center = this.registry.centerOf(action.objectId);
        this.setFocus({
          kind: "point",
          objectId: action.objectId,
          x: center.x,
          y: center.y,
          until: Date.now() + action.holdMs,
        });
        break;
      }
      case "show_pointer": {
        if (action.objectId) {
          this.require(action.objectId);
          const center = this.registry.centerOf(action.objectId);
          this.setFocus({
            kind: "point",
            objectId: action.objectId,
            x: center.x,
            y: center.y,
            until: Date.now() + action.holdMs,
          });
        } else {
          this.setFocus({
            kind: "point",
            objectId: null,
            x: action.x ?? 0,
            y: action.y ?? 0,
            until: Date.now() + action.holdMs,
          });
        }
        break;
      }
      case "highlight": {
        this.require(action.objectId);
        const center = this.registry.centerOf(action.objectId);
        this.setFocus({
          kind: "highlight",
          objectId: action.objectId,
          x: center.x,
          y: center.y,
          color: action.color ?? "#e11d48",
          until: Date.now() + action.holdMs,
        });
        break;
      }
      case "clear_focus":
        this.clearFocusImmediate();
        break;
      default: {
        const _exhaustive: never = action;
        throw new Error(`UNKNOWN_ACTION:${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  /** Non-blocking focus must not delay tool-result return for the full hold. */
  isNonBlocking(action: BoardAction): boolean {
    return !isBlockingAction(action);
  }

  private require(objectId: string) {
    if (!this.registry.has(objectId)) {
      throw Object.assign(new Error("OBJECT_NOT_FOUND"), {
        code: "OBJECT_NOT_FOUND",
        objectId,
        availableObjectIds: this.registry.listIds(),
      });
    }
  }

  private setFocus(focus: FocusState) {
    if (this.focusTimer) clearTimeout(this.focusTimer);
    this.focus = focus;
    this.hooks.onFocusChange(focus);
    const remaining = Math.max(0, focus.until - Date.now());
    this.focusTimer = setTimeout(() => {
      this.clearFocusImmediate();
    }, remaining);
  }

  private clearFocusImmediate() {
    if (this.focusTimer) clearTimeout(this.focusTimer);
    this.focusTimer = null;
    this.focus = { kind: null, objectId: null, x: null, y: null, until: 0 };
    this.hooks.onFocusChange(this.focus);
  }

  private async tween(ms: number) {
    await this.sleep(ms);
  }

  private sleep(ms: number) {
    return (this.hooks.sleep ?? defaultSleep)(ms);
  }
}

export function notFoundResult(
  objectId: string,
  availableObjectIds: string[],
): BoardApplyActionsResult {
  return {
    success: false,
    applied: [],
    error: "OBJECT_NOT_FOUND",
    objectId,
    availableObjectIds,
  };
}
