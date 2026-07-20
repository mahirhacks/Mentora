import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  classifyStudentTranscript,
  ConversationManager,
  isScrapTranscript,
  transcriptSimilarity,
} from "./conversationManager";

describe("transcriptSimilarity", () => {
  it("scores Alright vs Alsta highly", () => {
    expect(transcriptSimilarity("Alsta", "Alright, quick check-in")).toBeGreaterThanOrEqual(
      0.55,
    );
  });

  it("scores unrelated answers low", () => {
    expect(transcriptSimilarity("Python", "Alright, what do you know?")).toBeLessThan(
      0.55,
    );
  });
});

describe("classifyStudentTranscript", () => {
  it("marks echo only when Mentora speaking/interrupted and similar", () => {
    expect(
      classifyStudentTranscript({
        transcript: "Alsta",
        mentoraSpeaking: true,
        mentoraRecentlyInterrupted: false,
        lastMentoraTranscript: "Alright, quick check-in: What do you know?",
      }),
    ).toBe("echo");
  });

  it("keeps okay as student while Mentora is waiting", () => {
    expect(
      classifyStudentTranscript({
        transcript: "okay",
        mentoraSpeaking: false,
        mentoraRecentlyInterrupted: false,
        lastMentoraTranscript: "Alright, what do you already know about Python?",
      }),
    ).toBe("student");
  });

  it("keeps yes as student after Mentora asked", () => {
    expect(
      classifyStudentTranscript({
        transcript: "yes",
        mentoraSpeaking: false,
        mentoraRecentlyInterrupted: false,
        lastMentoraTranscript: "Do you want to continue?",
      }),
    ).toBe("student");
  });

  it("treats empty as scrap", () => {
    expect(isScrapTranscript("...")).toBe(true);
    expect(
      classifyStudentTranscript({
        transcript: "...",
        mentoraSpeaking: true,
        mentoraRecentlyInterrupted: false,
        lastMentoraTranscript: "Hello",
      }),
    ).toBe("scrap");
  });
});

describe("ConversationManager delete-ack", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resumes only after item.deleted and only once", () => {
    const cm = new ConversationManager();
    cm.noteMentoraInterrupted();
    cm.beginEchoDelete("item_1", true);
    expect(cm.onItemDeleted("item_1")).toBe(true);
    cm.beginEchoDelete("item_2", true);
    expect(cm.onItemDeleted("item_2")).toBe(false);
  });

  it("does not resume on delete-ack timeout", () => {
    const cm = new ConversationManager();
    const onTimeout = vi.fn();
    cm.beginEchoDelete("item_x", true);
    cm.armDeleteAckTimeout(onTimeout);
    vi.advanceTimersByTime(2000);
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(cm.pendingDelete).toBeNull();
    expect(cm.onItemDeleted("item_x")).toBe(false);
  });
});
