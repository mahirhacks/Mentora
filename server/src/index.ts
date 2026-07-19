import express from "express";
import cors from "cors";
import { HealthResponseSchema } from "@mentora/shared";
import { env } from "./env.js";
import { realtimeTokenRouter } from "./routes/realtimeToken.js";
import { lessonRouter } from "./routes/lesson.js";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  const body = HealthResponseSchema.parse({
    ok: true as const,
    service: "mentora" as const,
    ts: Date.now(),
  });
  res.json(body);
});

app.use("/api/realtime", realtimeTokenRouter);
app.use("/api/lesson", lessonRouter);

app.listen(env.port, () => {
  console.log(`[mentora-server] listening on http://localhost:${env.port}`);
});
