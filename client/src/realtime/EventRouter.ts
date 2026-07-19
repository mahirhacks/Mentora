import { REALTIME_TOOLS } from "@mentora/shared";
import type { BoardActionQueue } from "../board/ActionQueue";
import type { RealtimeClient } from "./RealtimeClient";
import { handleToolCall, type ToolCall } from "./toolHandlers";
import { CONTINUE_AFTER_TOOLS } from "./instructions";
import { useTeachingStore } from "../state/teachingStore";

/**
 * Routes Realtime data-channel events: tool calls, speech interrupts, etc.
 */
export class EventRouter {
  private pendingArgs = new Map<string, { name: string; arguments: string }>();
  private executed = new Set<string>();
  /** Tool calls still running (or queued) before we may create a follow-up response. */
  private inFlight = 0;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private client: RealtimeClient,
    private queue: BoardActionQueue,
  ) {}

  async onEvent(event: Record<string, unknown>) {
    const type = String(event.type ?? "");

    if (type === "error") {
      console.error("[mentora:realtime:error]", event);
    }

    if (type === "input_audio_buffer.speech_started") {
      this.queue.interruptDropPending();
      useTeachingStore.getState().patchRuntime({ wasInterrupted: true });
    }

    // Accumulate streamed function args
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
    }

    // GA: arguments finalized on this event (fields are top-level)
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

  private scheduleContinueResponse() {
    if (this.responseTimer) clearTimeout(this.responseTimer);
    this.responseTimer = setTimeout(() => {
      this.responseTimer = null;
      if (this.inFlight > 0) return;
      const phase = useTeachingStore.getState().runtime.phase;
      // If we're already waiting on the student, don't poke the model to talk.
      if (phase === "waiting_for_student" || phase === "complete") return;
      this.client.sendEvent({
        type: "response.create",
        response: {
          instructions: CONTINUE_AFTER_TOOLS,
        },
      });
    }, 120);
  }

  private async execute(call: ToolCall) {
    if (!call.call_id || !call.name) return;
    if (this.executed.has(call.call_id)) return;
    this.executed.add(call.call_id);
    this.inFlight += 1;

    try {
      const { call_id, output } = await handleToolCall(call, this.queue);
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
      this.client.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            success: false,
            error: "EXECUTION_ERROR",
            issues: [err instanceof Error ? err.message : String(err)],
          }),
        },
      });
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.scheduleContinueResponse();
    }
  }
}

export function toolsForSession() {
  return REALTIME_TOOLS;
}
