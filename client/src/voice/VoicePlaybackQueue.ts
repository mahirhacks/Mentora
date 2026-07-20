const SAMPLE_RATE = 24_000;

export class VoicePlaybackQueue {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private chain: Promise<void> = Promise.resolve();

  enqueue(base64: string, mimeType = "audio/pcm16"): Promise<void> {
    this.chain = this.chain.then(() => this.play(base64, mimeType));
    return this.chain;
  }

  cancel() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // no-op
      }
    }
    this.activeSources.clear();
    this.nextStartTime = 0;
    this.chain = Promise.resolve();
  }

  private async ensureContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    return this.audioContext;
  }

  private async play(base64: string, mimeType: string) {
    const context = await this.ensureContext();

    if (mimeType === "audio/pcm16") {
      await this.playPcm16(context, base64);
      return;
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const audioBuffer = await context.decodeAudioData(bytes.buffer.slice(0));
    await this.scheduleBuffer(context, audioBuffer);
  }

  private async playPcm16(context: AudioContext, base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const pcm16 = new Int16Array(
      bytes.buffer,
      bytes.byteOffset,
      Math.floor(bytes.byteLength / 2),
    );
    const audioBuffer = context.createBuffer(1, pcm16.length, SAMPLE_RATE);
    const channel = audioBuffer.getChannelData(0);

    for (let index = 0; index < pcm16.length; index += 1) {
      channel[index] = pcm16[index] / 32_768;
    }

    await this.scheduleBuffer(context, audioBuffer);
  }

  private scheduleBuffer(context: AudioContext, audioBuffer: AudioBuffer) {
    return new Promise<void>((resolve) => {
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      this.activeSources.add(source);

      const startAt = Math.max(context.currentTime, this.nextStartTime);
      source.start(startAt);
      this.nextStartTime = startAt + audioBuffer.duration;

      source.onended = () => {
        this.activeSources.delete(source);
        resolve();
      };
    });
  }
}
