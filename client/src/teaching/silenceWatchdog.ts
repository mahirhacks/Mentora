type SilenceHandlers = {
  onFirstNudge: () => void;
  onSecondNudge: () => void;
  isSuspended: () => boolean;
  isWaiting: () => boolean;
};

/** 8–12s silence watchdog (default 10s). Suspends while student draws. */
export class SilenceWatchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nudges = 0;
  private readonly delayMs: number;

  constructor(
    private handlers: SilenceHandlers,
    delayMs = 10000,
  ) {
    this.delayMs = delayMs;
  }

  reset() {
    this.clear();
    this.nudges = 0;
    this.arm();
  }

  arm() {
    this.clear();
    if (!this.handlers.isWaiting()) return;
    this.timer = setTimeout(() => this.tick(), this.delayMs);
  }

  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private tick() {
    if (this.handlers.isSuspended() || !this.handlers.isWaiting()) {
      this.arm();
      return;
    }
    this.nudges += 1;
    if (this.nudges === 1) this.handlers.onFirstNudge();
    else if (this.nudges === 2) this.handlers.onSecondNudge();
    this.arm();
  }
}
