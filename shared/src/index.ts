export * from "./board.js";
export * from "./lesson.js";
export * from "./tools.js";
export * from "./fallbackSquareLesson.js";
export * from "./genericFallbackLesson.js";

import { z } from "zod";

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("mentora"),
  ts: z.number().int(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1";
export const DEFAULT_PLANNER_MODEL = "gpt-5.6-terra";
