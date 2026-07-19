import { Router } from "express";
import { env } from "../env.js";
import { realtimeSessionConfig } from "../services/openaiRealtime.js";

export const realtimeTokenRouter = Router();

realtimeTokenRouter.post("/token", async (_req, res) => {
  try {
    const apiKey = env.openaiApiKey();
    const session = realtimeSessionConfig();

    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": "mentora-local-dev",
        },
        body: JSON.stringify({ session }),
      },
    );

    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const message =
        typeof data.error === "object" &&
        data.error &&
        "message" in data.error
          ? String((data.error as { message?: string }).message)
          : JSON.stringify(data);
      res.status(response.status).json({
        error: "client_secrets_failed",
        status: response.status,
        message,
      });
      return;
    }

    const value =
      (typeof data.value === "string" && data.value) ||
      (typeof (data as { client_secret?: { value?: string } }).client_secret
        ?.value === "string" &&
        (data as { client_secret: { value: string } }).client_secret.value);

    if (!value) {
      res.status(502).json({
        error: "client_secrets_malformed",
        message: "Response missing ephemeral token value",
        raw: data,
      });
      return;
    }

    res.json({
      value,
      expiresAt:
        (data as { expires_at?: number }).expires_at ??
        (data as { client_secret?: { expires_at?: number } }).client_secret
          ?.expires_at,
      session,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "token_mint_exception", message });
  }
});
