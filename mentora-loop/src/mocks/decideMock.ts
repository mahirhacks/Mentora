import type { DecideRequest, TeachingChoreography } from "@mentora/shared";
import {
  setDecideTeachingBeatOverride,
  type DecideTeachingBeatFn,
} from "@client/api/lessonApi";

export type DecideMock = {
  calls: DecideRequest[];
  install: () => void;
  uninstall: () => void;
  setBeat: (beat: TeachingChoreography) => void;
  setFactory: (
    fn: (input: DecideRequest) => TeachingChoreography,
  ) => void;
};

/** In-process Decision API mock (no HTTP / no OpenAI). */
export function createDecideMock(
  initial: TeachingChoreography,
): DecideMock {
  const calls: DecideRequest[] = [];
  let beat = initial;
  let factory: ((input: DecideRequest) => TeachingChoreography) | null =
    null;

  const impl: DecideTeachingBeatFn = async (input) => {
    calls.push(input);
    const resolved = factory ? factory(input) : beat;
    return { beat: resolved, source: "mock" };
  };

  return {
    calls,
    install: () => setDecideTeachingBeatOverride(impl),
    uninstall: () => setDecideTeachingBeatOverride(null),
    setBeat: (next) => {
      beat = next;
      factory = null;
    },
    setFactory: (fn) => {
      factory = fn;
    },
  };
}
