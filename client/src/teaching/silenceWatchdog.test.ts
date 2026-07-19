import { describe, expect, it, vi } from "vitest";
import { SilenceWatchdog } from "./silenceWatchdog";

describe("SilenceWatchdog", () => {
  it("nudges after delay while waiting", async () => {
    vi.useFakeTimers();
    const onFirstNudge = vi.fn();
    const onSecondNudge = vi.fn();
    const wd = new SilenceWatchdog(
      {
        isWaiting: () => true,
        isSuspended: () => false,
        onFirstNudge,
        onSecondNudge,
      },
      1000,
    );
    wd.reset();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onFirstNudge).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSecondNudge).toHaveBeenCalledTimes(1);
    wd.clear();
    vi.useRealTimers();
  });
});
