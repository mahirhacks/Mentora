import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config();

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  openaiApiKey: () => requireEnv("OPENAI_API_KEY"),
  realtimeModel: process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime-2.1",
  plannerModel: process.env.OPENAI_PLANNER_MODEL?.trim() || "gpt-5.6-terra",
};
