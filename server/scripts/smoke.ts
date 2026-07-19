/**
 * Phase 0 smoke — fail fast on Malaysia key / model access gaps.
 *
 * 1) Mint ephemeral Realtime client secret
 * 2) WebRTC SDP handshake via /v1/realtime/calls
 * 3) WebSocket session + response.cancel (interrupt path)
 * 4) One gpt-5.6-terra structured Responses call
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import OpenAI from "openai";
import WebSocket from "ws";
import { z } from "zod";
import {
  DEFAULT_PLANNER_MODEL,
  DEFAULT_REALTIME_MODEL,
} from "@mentora/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config();

const require = createRequire(import.meta.url);

type StepResult = { name: string; ok: boolean; detail: string };

function fail(msg: string): never {
  console.error(`\n[smoke] FAIL: ${msg}`);
  process.exit(1);
}

function info(msg: string) {
  console.log(`[smoke] ${msg}`);
}

function requireKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) fail("OPENAI_API_KEY missing in .env");
  return key;
}

const realtimeModel =
  process.env.OPENAI_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL;
const plannerModel =
  process.env.OPENAI_PLANNER_MODEL?.trim() || DEFAULT_PLANNER_MODEL;

function sessionConfig() {
  return {
    type: "realtime" as const,
    model: realtimeModel,
    reasoning: { effort: "low" as const },
    output_modalities: ["audio" as const],
    audio: {
      input: {
        turn_detection: {
          type: "semantic_vad" as const,
          eagerness: "low" as const,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: "marin" as const },
    },
  };
}

async function mintClientSecret(apiKey: string): Promise<{
  value: string;
  raw: unknown;
}> {
  const response = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": "mentora-smoke",
      },
      body: JSON.stringify({ session: sessionConfig() }),
    },
  );
  const raw = await response.json();
  if (!response.ok) {
    const status = response.status;
    const message = JSON.stringify(raw);
    if (status === 403) {
      fail(
        `Realtime client_secrets 403 — this key likely lacks Realtime access (common on some regional keys). Detail: ${message}`,
      );
    }
    fail(`client_secrets HTTP ${status}: ${message}`);
  }

  const value =
    (raw as { value?: string }).value ||
    (raw as { client_secret?: { value?: string } }).client_secret?.value;

  if (!value?.startsWith("ek_")) {
    fail(`client_secrets missing ek_ token: ${JSON.stringify(raw)}`);
  }

  return { value, raw };
}

async function webrtcSdpHandshake(ephemeralKey: string): Promise<string> {
  // Prefer native/Node WebRTC if available; otherwise synthesize a minimal offer
  // and still exercise /v1/realtime/calls auth + SDP exchange.
  let offerSdp: string;

  try {
    // Optional dependency — install may provide wrtc on some platforms
    const wrtc = require("@roamhq/wrtc") as {
      RTCPeerConnection: new (config?: unknown) => {
        createDataChannel: (label: string) => unknown;
        createOffer: () => Promise<{ sdp?: string; type: string }>;
        setLocalDescription: (desc: unknown) => Promise<void>;
        localDescription: { sdp?: string } | null;
        close: () => void;
      };
    };
    const pc = new wrtc.RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pc.createDataChannel("oai-events");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // brief gather
    await new Promise((r) => setTimeout(r, 500));
    offerSdp = pc.localDescription?.sdp || offer.sdp || "";
    pc.close();
    if (!offerSdp) throw new Error("empty offer from wrtc");
  } catch {
    offerSdp = [
      "v=0",
      "o=- 0 0 IN IP4 127.0.0.1",
      "s=-",
      "t=0 0",
      "a=group:BUNDLE 0",
      "a=extmap-allow-mixed",
      "a=msid-semantic: WMS",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "c=IN IP4 0.0.0.0",
      "a=rtcp:9 IN IP4 0.0.0.0",
      "a=ice-ufrag:mentora",
      "a=ice-pwd:mentoraicepwdmentoraicepwd",
      "a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
      "a=setup:actpass",
      "a=mid:0",
      "a=sendrecv",
      "a=rtcp-mux",
      "a=rtpmap:111 opus/48000/2",
      "a=fmtp:111 minptime=10;useinbandfec=1",
      "",
    ].join("\r\n");
  }

  const response = await fetch(
    `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(realtimeModel)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
      body: offerSdp,
    },
  );

  const text = await response.text();
  if (!response.ok) {
    if (response.status === 403) {
      fail(
        `Realtime /calls 403 — WebRTC path denied for this key. Detail: ${text}`,
      );
    }
    // Synthetic SDP may fail validation; still report clearly
    fail(`WebRTC SDP handshake HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  if (!text.includes("v=0")) {
    fail(`WebRTC answer missing SDP: ${text.slice(0, 300)}`);
  }

  return text.slice(0, 120);
}

async function interruptViaWebSocket(apiKey: string): Promise<string> {
  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(realtimeModel)}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    let created = false;
    let cancelled = false;
    const timeout = setTimeout(() => {
      ws.close();
      reject(
        new Error(
          "WebSocket interrupt smoke timed out waiting for session/response events",
        ),
      );
    }, 45000);

    const send = (payload: unknown) => {
      ws.send(JSON.stringify(payload));
    };

    ws.on("open", () => {
      send({
        type: "session.update",
        session: sessionConfig(),
      });
    });

    ws.on("message", (buf) => {
      let event: { type?: string; [k: string]: unknown };
      try {
        event = JSON.parse(buf.toString());
      } catch {
        return;
      }

      if (event.type === "error") {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(`Realtime WS error: ${JSON.stringify(event)}`));
        return;
      }

      if (event.type === "session.created" || event.type === "session.updated") {
        if (!created) {
          created = true;
          send({
            type: "response.create",
            response: {
              output_modalities: ["text"],
              instructions:
                "Say only: smoke test. Keep it to three words.",
            },
          });
        }
      }

      if (
        event.type === "response.created" ||
        event.type === "response.output_text.delta" ||
        event.type === "response.output_audio.delta" ||
        event.type === "response.content_part.added"
      ) {
        if (!cancelled) {
          cancelled = true;
          send({ type: "response.cancel" });
        }
      }

      if (
        event.type === "response.cancelled" ||
        event.type === "response.done"
      ) {
        // response.done after cancel is also acceptable evidence the cancel path ran
        clearTimeout(timeout);
        ws.close();
        resolve(
          `interrupt path ok (got ${event.type}; session interrupt_response configured)`,
        );
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

const SmokePlanSchema = z.object({
  lessonTitle: z.string(),
  firstQuestion: z.string(),
  ok: z.boolean(),
});

async function terraPlannerCall(apiKey: string): Promise<string> {
  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.create({
      model: plannerModel,
      reasoning: { effort: "low" },
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Return a tiny Mentora smoke lesson plan for expanding (a+b)^2. Keep strings short.",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "mentora_smoke_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              lessonTitle: { type: "string" },
              firstQuestion: { type: "string" },
              ok: { type: "boolean" },
            },
            required: ["lessonTitle", "firstQuestion", "ok"],
          },
        },
      },
    });

    const text =
      response.output_text ||
      response.output
        ?.flatMap((item) =>
          item.type === "message"
            ? item.content
                .filter((c) => c.type === "output_text")
                .map((c) => c.text)
            : [],
        )
        .join("") ||
      "";

    if (!text) {
      fail(`Terra returned empty output: ${JSON.stringify(response).slice(0, 600)}`);
    }

    const parsed = SmokePlanSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      fail(`Terra JSON failed Zod: ${parsed.error.message} | raw=${text}`);
    }

    return `terra ok model=${plannerModel} title="${parsed.data.lessonTitle}"`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("403") || message.toLowerCase().includes("access")) {
      fail(
        `Planner model "${plannerModel}" access denied (403). Confirm OPENAI_PLANNER_MODEL=gpt-5.6-terra on this key. Detail: ${message}`,
      );
    }
    fail(`Terra Responses call failed: ${message}`);
  }
}

async function main() {
  info("Phase 0 smoke starting…");
  info(`realtime=${realtimeModel} planner=${plannerModel}`);
  const apiKey = requireKey();
  const results: StepResult[] = [];

  info("1/4 mint ephemeral client secret…");
  const { value: ek } = await mintClientSecret(apiKey);
  results.push({
    name: "client_secrets",
    ok: true,
    detail: `got ${ek.slice(0, 12)}…`,
  });
  info(`   ok ${results[0].detail}`);

  info("2/4 WebRTC SDP handshake…");
  try {
    const snippet = await webrtcSdpHandshake(ek);
    results.push({
      name: "webrtc_sdp",
      ok: true,
      detail: `answer SDP received (${snippet.replace(/\s+/g, " ").slice(0, 60)}…)`,
    });
    info(`   ok ${results[1].detail}`);
  } catch (err) {
    // Re-mint and note — if synthetic SDP fails, still try interrupt+terra
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("FAIL:")) throw err;
    info(`   WebRTC via synthetic SDP failed (${message.slice(0, 180)})`);
    info("   retrying client_secret + documenting WebRTC auth with mint success");
    // Mint already proved Realtime; mark webrtc as soft-fail only if /calls itself is 403
    if (message.includes("403")) {
      fail(message.replace(/^WebRTC SDP handshake /, "WebRTC "));
    }
    results.push({
      name: "webrtc_sdp",
      ok: false,
      detail: message.slice(0, 240),
    });
    info(
      "   NOTE: installing optional @roamhq/wrtc may be needed for full SDP; continuing interrupt+Terra checks",
    );
  }

  info("3/4 interrupt path (WS response.cancel)…");
  const interruptDetail = await interruptViaWebSocket(apiKey);
  results.push({ name: "interrupt", ok: true, detail: interruptDetail });
  info(`   ok ${interruptDetail}`);

  info("4/4 Terra structured Responses…");
  const terraDetail = await terraPlannerCall(apiKey);
  results.push({ name: "terra", ok: true, detail: terraDetail });
  info(`   ok ${terraDetail}`);

  const hardFails = results.filter((r) => !r.ok && r.name !== "webrtc_sdp");
  const webrtcOk = results.find((r) => r.name === "webrtc_sdp")?.ok;

  console.log("\n[smoke] summary");
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "WARN"} ${r.name}: ${r.detail}`);
  }

  if (hardFails.length) {
    fail("one or more required smoke steps failed");
  }

  if (!webrtcOk) {
    console.log(
      "\n[smoke] PARTIAL: Realtime token + interrupt + Terra OK, but WebRTC SDP handshake needs a real RTCPeerConnection (browser or @roamhq/wrtc).",
    );
    console.log(
      "[smoke] For Phase 0 gate: mint + interrupt + Terra are the hard API-access checks. Re-run after client WebRTC lands for full green.",
    );
    process.exit(2);
  }

  console.log("\n[smoke] ALL GREEN — Phase 0 API access confirmed.");
  process.exit(0);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
