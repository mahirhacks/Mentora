export type RealtimeConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export type VoiceUiState =
  | "idle"
  | "thinking"
  | "speaking"
  | "waiting"
  | "listening";

type Handlers = {
  onState?: (state: RealtimeConnectionState) => void;
  onVoiceUi?: (state: VoiceUiState) => void;
  onEvent?: (event: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
};

export class RealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private muted = false;
  private handlers: Handlers;
  private outboundQueue: string[] = [];
  private dcOpen = false;

  constructor(handlers: Handlers = {}) {
    this.handlers = handlers;
  }

  get dataChannel(): RTCDataChannel | null {
    return this.dc;
  }

  async connect(ephemeralKey: string, model: string): Promise<void> {
    this.handlers.onState?.("connecting");
    this.handlers.onVoiceUi?.("thinking");
    this.dcOpen = false;
    this.outboundQueue = [];

    const pc = new RTCPeerConnection();
    this.pc = pc;

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) this.handlers.onRemoteStream?.(stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        this.handlers.onState?.("connected");
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        this.handlers.onState?.("error");
      }
    };

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    for (const track of this.localStream.getAudioTracks()) {
      pc.addTrack(track, this.localStream);
    }

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;

    const dcReady = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Realtime data channel open timed out"));
      }, 15000);
      dc.addEventListener("open", () => {
        clearTimeout(timeout);
        this.dcOpen = true;
        for (const raw of this.outboundQueue) {
          dc.send(raw);
        }
        this.outboundQueue = [];
        resolve();
      });
      dc.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Realtime data channel error"));
      });
    });

    dc.addEventListener("message", (msg) => {
      try {
        const event = JSON.parse(String(msg.data)) as Record<string, unknown>;
        this.handlers.onEvent?.(event);
        this.mapVoiceUi(event);
      } catch {
        // ignore non-JSON
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch(
      `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
      {
        method: "POST",
        body: offer.sdp ?? "",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      },
    );

    if (!sdpResponse.ok) {
      const text = await sdpResponse.text();
      this.handlers.onState?.("error");
      throw new Error(`Realtime SDP failed (${sdpResponse.status}): ${text}`);
    }

    const answer = await sdpResponse.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
    await dcReady;
    this.handlers.onState?.("connected");
    this.handlers.onVoiceUi?.("listening");
  }

  updateSession(partial: Record<string, unknown>) {
    this.sendEvent({
      type: "session.update",
      session: partial,
    });
  }

  /** Wait until session.updated (or timeout) after a session.update. */
  waitForSessionUpdated(timeoutMs = 8000): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);
      const onEvent = (event: Record<string, unknown>) => {
        if (event.type === "session.updated" || event.type === "error") {
          cleanup();
          resolve();
        }
      };
      const prev = this.handlers.onEvent;
      this.handlers.onEvent = (event) => {
        prev?.(event);
        onEvent(event);
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.handlers.onEvent = prev;
      };
    });
  }

  stopResponse() {
    this.sendEvent({ type: "response.cancel" });
    this.handlers.onVoiceUi?.("listening");
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
  }

  isMuted() {
    return this.muted;
  }

  sendEvent(payload: unknown) {
    const raw = JSON.stringify(payload);
    if (this.dcOpen && this.dc?.readyState === "open") {
      this.dc.send(raw);
      return;
    }
    this.outboundQueue.push(raw);
  }

  async disconnect() {
    try {
      this.stopResponse();
    } catch {
      // ignore
    }
    this.dc?.close();
    this.pc?.getSenders().forEach((s) => s.track?.stop());
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.localStream = null;
    this.dcOpen = false;
    this.outboundQueue = [];
    this.handlers.onState?.("idle");
    this.handlers.onVoiceUi?.("idle");
  }

  private mapVoiceUi(event: Record<string, unknown>) {
    const type = String(event.type ?? "");
    if (type === "response.created" || type.includes("output_audio")) {
      this.handlers.onVoiceUi?.("speaking");
    } else if (type === "input_audio_buffer.speech_started") {
      this.handlers.onVoiceUi?.("listening");
    } else if (type === "response.done" || type === "response.cancelled") {
      this.handlers.onVoiceUi?.("waiting");
    } else if (type === "session.updated" || type === "session.created") {
      this.handlers.onVoiceUi?.("listening");
    }
  }
}
