const SAMPLE_RATE = 24_000;

export interface VoiceMetrics {
  /** 0–1 loudness from the live playback signal. */
  amplitude: number;
  /** 0–1 relative pitch within a speech-ish frequency band. */
  pitch: number;
}

export class VoicePlaybackQueue {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;
  private timeDomain = new Uint8Array(0);
  private frequencyDomain = new Uint8Array(0);

  enqueue(base64: string, mimeType = "audio/pcm16"): Promise<void> {
    const generation = this.generation;
    this.chain = this.chain.then(() => {
      if (generation !== this.generation) {
        return;
      }
      return this.play(base64, mimeType);
    });
    return this.chain;
  }

  cancel() {
    this.generation += 1;
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

  isPlaying() {
    return this.activeSources.size > 0;
  }

  getVoiceMetrics(): VoiceMetrics {
    const analyser = this.analyser;
    if (!analyser || this.activeSources.size === 0) {
      return { amplitude: 0, pitch: 0.35 };
    }

    if (this.timeDomain.length !== analyser.fftSize) {
      this.timeDomain = new Uint8Array(analyser.fftSize);
    }
    if (this.frequencyDomain.length !== analyser.frequencyBinCount) {
      this.frequencyDomain = new Uint8Array(analyser.frequencyBinCount);
    }

    analyser.getByteTimeDomainData(this.timeDomain);
    analyser.getByteFrequencyData(this.frequencyDomain);

    let sumSquares = 0;
    for (let index = 0; index < this.timeDomain.length; index += 1) {
      const sample = (this.timeDomain[index]! - 128) / 128;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / this.timeDomain.length);
    const amplitude = Math.min(1, rms * 3.4);

    const sampleRate = this.audioContext?.sampleRate ?? SAMPLE_RATE;
    const binHz = sampleRate / analyser.fftSize;
    const minBin = Math.max(1, Math.floor(120 / binHz));
    const maxBin = Math.min(
      this.frequencyDomain.length - 1,
      Math.floor(900 / binHz),
    );

    let peakBin = minBin;
    let peakValue = 0;
    let weightedSum = 0;
    let energySum = 0;

    for (let bin = minBin; bin <= maxBin; bin += 1) {
      const value = this.frequencyDomain[bin] ?? 0;
      if (value > peakValue) {
        peakValue = value;
        peakBin = bin;
      }
      weightedSum += bin * value;
      energySum += value;
    }

    const dominantBin = energySum > 0 ? weightedSum / energySum : peakBin;
    const pitchHz = dominantBin * binHz;
    const pitch = Math.min(1, Math.max(0, (pitchHz - 140) / 520));

    return { amplitude, pitch };
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

  private ensureAnalyser(context: AudioContext) {
    if (!this.analyser) {
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.62;
      this.analyser.connect(context.destination);
    }
    return this.analyser;
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
      channel[index] = pcm16[index]! / 32_768;
    }

    await this.scheduleBuffer(context, audioBuffer);
  }

  private scheduleBuffer(context: AudioContext, audioBuffer: AudioBuffer) {
    return new Promise<void>((resolve) => {
      const analyser = this.ensureAnalyser(context);
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
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
