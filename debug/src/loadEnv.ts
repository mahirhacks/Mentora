import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "../../.env");

export interface DebugEnv {
  openaiApiKey: string;
  plannerModel: string;
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

export function loadEnv(): DebugEnv {
  const fileValues = existsSync(rootEnv) ? parseEnvFile(rootEnv) : {};

  const openaiApiKey =
    process.env.OPENAI_API_KEY ?? fileValues.OPENAI_API_KEY ?? "";
  const plannerModel =
    process.env.OPENAI_PLANNER_MODEL ??
    fileValues.OPENAI_PLANNER_MODEL ??
    "gpt-5.6";

  if (!openaiApiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Add it to the root .env file or your environment.",
    );
  }

  return { openaiApiKey, plannerModel };
}
