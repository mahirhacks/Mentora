/**
 * Optional structured event sink for Mentora coordination tests.
 * No-op in production unless a sink is registered (test mode only).
 */

export type MentoraProbeEvent = {
  ts: number;
  source: "conductor" | "gate" | "decide" | "realtime" | "board";
  type: string;
  data?: Record<string, unknown>;
};

export type MentoraProbeSink = (event: MentoraProbeEvent) => void;

let sink: MentoraProbeSink | null = null;
let seq = 0;

export function setMentoraProbeSink(next: MentoraProbeSink | null) {
  sink = next;
  if (!next) seq = 0;
}

export function isMentoraProbeActive() {
  return sink !== null;
}

export function mentoraProbe(
  source: MentoraProbeEvent["source"],
  type: string,
  data?: Record<string, unknown>,
) {
  if (!sink) return;
  seq += 1;
  sink({
    ts: Date.now(),
    source,
    type,
    data: { seq, ...data },
  });
}

export function resetMentoraProbe() {
  sink = null;
  seq = 0;
}
