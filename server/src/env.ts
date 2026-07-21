import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "../../.env");

export interface ServerEnv {
  openaiApiKey: string;
  plannerModel: string;
  transcriptionModel: string;
  realtimeModel: string;
  port: number;
}

function parseEnvFile(path: string): Record<string, string> {
  const content = readFileSync(path, "utf8");
  const values: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    values[key] = value;
  }

  return values;
}

export function loadEnv(): ServerEnv {
  const fileValues = existsSync(rootEnv) ? parseEnvFile(rootEnv) : {};

  const openaiApiKey =
    process.env.OPENAI_API_KEY ?? fileValues.OPENAI_API_KEY ?? "";
  const plannerModel =
    process.env.OPENAI_PLANNER_MODEL ??
    fileValues.OPENAI_PLANNER_MODEL ??
    "gpt-5.6-terra";
  const transcriptionModel =
    process.env.OPENAI_TRANSCRIPTION_MODEL ??
    fileValues.OPENAI_TRANSCRIPTION_MODEL ??
    "gpt-4o-mini-transcribe";
  const realtimeModel =
    process.env.OPENAI_REALTIME_MODEL ??
    fileValues.OPENAI_REALTIME_MODEL ??
    "gpt-realtime-2.1-mini";
  const port = Number(process.env.PORT ?? fileValues.PORT ?? 3001);

  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment or root .env");
  }

  return {
    openaiApiKey,
    plannerModel,
    transcriptionModel,
    realtimeModel,
    port,
  };
}
