import { REALTIME_TOOLS } from "@mentora/shared";
import type { BoardActionQueue } from "../board/ActionQueue";
import type { RealtimeClient } from "./RealtimeClient";
import {
  handleToolCall,
  type ToolCall,
} from "./toolHandlers";
import { CONTINUE_AFTER_TOOLS } from "./instructions";
import type { TurnGate } from "./turnGate";
import { useTeachingStore } from "../state/teachingStore";
import { isBoardTool, isFocusOnlyBoardTool, setVoiceActivity } from "./voiceActivity";

/**
 * Routes Realtime tool calls and coordinates with TurnGate.
 */
export class EventRouter {
  private pendingArgs = new Map<string, { name: string; arguments: string }>();
  private executed = new Set<string>();
  private inFlight = 0;
  private drawingJobs = 0;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;
  private needsContinue = false;

  constructor(
    private client: RealtimeClient,
    private queue: BoardActionQueue,
    private gate: TurnGate,
  ) {}

  async onEvent(event: Record<string, unknown>) {
    const type = String(event.type ?? "");

    if (type === "error") {
      console.error("[mentora:realtime:error]", event);
    }

    if (type === "response.created") {
      if (this.gate.shouldCancelWhileWaiting()) {
        console.info("[mentora:gate] cancel stray response while waiting");
        this.client.sendEvent({ type: "response.cancel" });
        this.needsContinue = false;
        return;
      }
      this.gate.onResponseCreated(event);
      if (this.responseTimer) {
        clearTimeout(this.responseTimer);
        this.responseTimer = null;
      }
    }

    if (type === "response.done" || type === "response.cancelled") {
      this.gate.onResponseFinished(event, type === "response.cancelled");
      // Waiting transition is owned by TurnGate (completed + metadata match).
      this.flushContinueIfNeeded();
    }

    if (type === "input_audio_buffer.speech_started") {
      this.queue.interruptDropPending();
      this.needsContinue = false;
      if (this.responseTimer) {
        clearTimeout(this.responseTimer);
        this.responseTimer = null;
      }
      this.gate.onSpeechStarted();
    }

    if (type === "input_audio_buffer.speech_stopped") {
      this.gate.onSpeechStopped();
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      this.gate.onTranscriptionCompleted(
        String(event.transcript ?? ""),
        String(event.item_id ?? ""),
      );
    }

    if (type === "conversation.item.deleted") {
      const itemId = String(
        (event.item as { id?: string } | undefined)?.id ??
          event.item_id ??
          "",
      );
      if (itemId) this.gate.onItemDeleted(itemId);
    }

    if (
      type === "response.function_call_arguments.delta" ||
      type === "response.output_item.added"
    ) {
      const item = event.item as
        | { type?: string; call_id?: string; name?: string; arguments?: string }
        | undefined;
      const callId = String(event.call_id ?? item?.call_id ?? "");
      if (!callId) return;
      const name = String(
        event.name ?? item?.name ?? this.pendingArgs.get(callId)?.name ?? "",
      );
      const delta = String(event.delta ?? "");
      const prev = this.pendingArgs.get(callId) ?? { name, arguments: "" };
      const baseArgs =
        typeof item?.arguments === "string" ? item.arguments : prev.arguments;
      this.pendingArgs.set(callId, {
        name: name || prev.name,
        arguments: baseArgs + delta,
      });
      if (name && isBoardTool(name)) {
        setVoiceActivity({ thinking: true });
      }
    }

    if (type === "response.function_call_arguments.done") {
      const callId = String(event.call_id ?? "");
      const name = String(
        event.name ?? this.pendingArgs.get(callId)?.name ?? "",
      );
      const args = String(
        event.arguments ?? this.pendingArgs.get(callId)?.arguments ?? "{}",
      );
      if (callId && name) {
        console.info("[mentora:tool]", name, args.slice(0, 200));
        await this.execute({ call_id: callId, name, arguments: args });
        this.pendingArgs.delete(callId);
      }
      return;
    }

    if (type === "response.output_item.done") {
      const item = event.item as
        | { type?: string; call_id?: string; name?: string; arguments?: string }
        | undefined;
      if (item?.type === "function_call" && item.call_id && item.name) {
        console.info("[mentora:tool:item]", item.name);
        await this.execute({
          call_id: item.call_id,
          name: item.name,
          arguments:
            item.arguments ??
            this.pendingArgs.get(item.call_id)?.arguments ??
            "{}",
        });
        this.pendingArgs.delete(item.call_id);
      }
      return;
    }

    if (type === "response.done") {
      const response = event.response as
        | { output?: Array<Record<string, unknown>> }
        | undefined;
      for (const item of response?.output ?? []) {
        if (item.type === "function_call") {
          const callId = String(item.call_id ?? "");
          const name = String(item.name ?? "");
          if (!callId || !name) continue;
          console.info("[mentora:tool:done]", name);
          await this.execute({
            call_id: callId,
            name,
            arguments: String(item.arguments ?? "{}"),
          });
        }
      }
    }
  }

  private flushContinueIfNeeded() {
    if (!this.needsContinue) return;
    if (this.inFlight > 0) return;
    if (this.gate.isResponseLive()) return;

    const phase = useTeachingStore.getState().runtime.phase;
    if (phase === "waiting_for_student" || phase === "complete") {
      this.needsContinue = false;
      return;
    }

    if (this.responseTimer) clearTimeout(this.responseTimer);
    this.responseTimer = setTimeout(() => {
      this.responseTimer = null;
      if (!this.needsContinue || this.inFlight > 0 || this.gate.isResponseLive()) {
        return;
      }
      const p = useTeachingStore.getState().runtime.phase;
      if (p === "waiting_for_student" || p === "complete") {
        this.needsContinue = false;
        return;
      }
      this.needsContinue = false;
      this.client.sendEvent({
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          tool_choice: "none",
          instructions: CONTINUE_AFTER_TOOLS,
        },
      });
    }, 350);
  }

  private async execute(call: ToolCall) {
    if (!call.call_id || !call.name) return;
    if (this.executed.has(call.call_id)) return;
    this.executed.add(call.call_id);
    this.inFlight += 1;
    const board = isBoardTool(call.name);
    const focusOnly = board && isFocusOnlyBoardTool(call.name, call.arguments);
    if (board) {
      this.drawingJobs += 1;
      // Focus overlays (point/highlight) must not steal the "speaking" UI mid-sentence.
      if (focusOnly) {
        setVoiceActivity({ drawing: true, thinking: false });
      } else {
        setVoiceActivity({ drawing: true, thinking: false, speaking: false });
      }
    } else {
      setVoiceActivity({ thinking: true });
    }

    let toolOutput = "";
    try {
      const { call_id, output } = await handleToolCall(call, this.queue);
      toolOutput = output;
      console.info("[mentora:tool:result]", call.name, output.slice(0, 240));
      this.client.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id,
          output,
        },
      });
    } catch (err) {
      console.error("[mentora:tool:fail]", call.name, err);
      toolOutput = JSON.stringify({
        success: false,
        error: "EXECUTION_ERROR",
        issues: [err instanceof Error ? err.message : String(err)],
      });
      this.client.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: toolOutput,
        },
      });
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      if (board) {
        this.drawingJobs = Math.max(0, this.drawingJobs - 1);
        if (this.drawingJobs === 0) {
          setVoiceActivity({ drawing: false });
        }
        // Heavy draws may end the audio turn — request a continue.
        // Focus-only point/highlight rides under live speech; do not fragment.
        if (!focusOnly) {
          this.needsContinue = true;
        }
      }
      // update_lesson_state is refused by the client (CLIENT_OWNS_PHASE).
      // Do not special-case it for continue / ASK_FIRST — phases are client-owned.
      if (this.inFlight === 0) {
        setVoiceActivity({ thinking: false, drawing: this.drawingJobs > 0 });
        this.flushContinueIfNeeded();
      }
    }
  }
}

export function toolsForSession() {
  return REALTIME_TOOLS;
}
