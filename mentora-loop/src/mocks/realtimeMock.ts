import type { RealtimeClient } from "@client/realtime/RealtimeClient";
import { mentoraProbe } from "@client/testing/mentoraTestProbe";

type OutboundListener = (event: Record<string, unknown>) => void;

/**
 * Deterministic Realtime stand-in. Captures outbound events and lets tests
 * inject response.created / transcript / response.done without WebRTC or OpenAI.
 */
export class MockRealtimeClient {
  readonly sent: Record<string, unknown>[] = [];
  private listeners = new Set<OutboundListener>();
  private responseSeq = 0;

  asClient(): RealtimeClient {
    return this as unknown as RealtimeClient;
  }

  onOutbound(listener: OutboundListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  updateSession(_partial: Record<string, unknown>) {
    // no-op for tests
  }

  deleteConversationItem(itemId: string) {
    this.sendEvent({
      type: "conversation.item.delete",
      item_id: itemId,
    });
  }

  sendEvent(payload: unknown) {
    const event = payload as Record<string, unknown>;
    this.sent.push(event);
    mentoraProbe("realtime", "outbound", {
      type: String(event.type ?? ""),
    });
    for (const listener of this.listeners) listener(event);
  }

  responseCreates() {
    return this.sent.filter((e) => e.type === "response.create");
  }

  nextResponseId() {
    this.responseSeq += 1;
    return `resp_mock_${this.responseSeq}`;
  }

  /** Build a response.created event matching the last response.create metadata. */
  makeCreatedFromLastCreate(responseId?: string) {
    const create = [...this.responseCreates()].at(-1);
    if (!create) throw new Error("No response.create to ack");
    const response = create.response as {
      metadata?: Record<string, string>;
    };
    const id = responseId ?? this.nextResponseId();
    return {
      type: "response.created",
      response_id: id,
      response: {
        id,
        metadata: { ...(response.metadata ?? {}) },
      },
    };
  }

  makeDone(input: {
    responseId: string;
    status: "completed" | "cancelled" | "failed" | "incomplete";
    metadata: Record<string, string>;
  }) {
    return {
      type: "response.done",
      response: {
        id: input.responseId,
        status: input.status,
        metadata: input.metadata,
      },
    };
  }
}
