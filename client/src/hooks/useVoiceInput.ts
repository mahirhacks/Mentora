import { useCallback, useEffect, useRef, useState } from "react";
import { fetchVoiceConfig } from "../api/voiceApi";

const SPEECH_THRESHOLD = 0.018;
const SILENCE_MS = 1_200;
const MIN_SPEECH_MS = 450;
const MAX_RECORDING_MS = 20_000;

export type MicStatus =
  | "muted"
  | "ready"
  | "listening"
  | "recording"
  | "transcribing";

interface UseVoiceInputOptions {
  disabled?: boolean;
  onUtterance: (blob: Blob) => Promise<void>;
  onBargeIn?: () => void;
}

function pickRecorderMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
}

export function useVoiceInput({
  disabled = false,
  onUtterance,
  onBargeIn,
}: UseVoiceInputOptions) {
  const [isMuted, setIsMuted] = useState(true);
  const [micStatus, setMicStatus] = useState<MicStatus>("muted");
  const [micError, setMicError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const monitorFrameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const lastSpeechAtRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const isMutedRef = useRef(true);
  const isTranscribingRef = useRef(false);
  const isDisabledRef = useRef(false);
  const onUtteranceRef = useRef(onUtterance);

  const onBargeInRef = useRef(onBargeIn);

  useEffect(() => {
    onUtteranceRef.current = onUtterance;
  }, [onUtterance]);

  useEffect(() => {
    onBargeInRef.current = onBargeIn;
  }, [onBargeIn]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isDisabledRef.current = disabled;
  }, [disabled]);

  const stopMonitor = useCallback(() => {
    if (monitorFrameRef.current !== null) {
      cancelAnimationFrame(monitorFrameRef.current);
      monitorFrameRef.current = null;
    }
  }, []);

  const stopRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorderRef.current = null;
    isRecordingRef.current = false;
    recordingStartedAtRef.current = null;
  }, []);

  const releaseStream = useCallback(() => {
    stopMonitor();
    stopRecorder();

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
  }, [stopMonitor, stopRecorder]);

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    await new Promise<void>((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          resolve();
        },
        { once: true },
      );
      recorder.stop();
    });

    recorderRef.current = null;
    isRecordingRef.current = false;
    recordingStartedAtRef.current = null;

    const mimeType = recorder.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    if (blob.size < 256 || isDisabledRef.current) {
      if (!isMutedRef.current && !isTranscribingRef.current) {
        setMicStatus("listening");
      }
      return;
    }

    try {
      isTranscribingRef.current = true;
      setMicStatus("transcribing");
      await onUtteranceRef.current(blob);
    } finally {
      isTranscribingRef.current = false;
      if (!isMutedRef.current) {
        setMicStatus("listening");
      }
    }
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || isRecordingRef.current || isMutedRef.current) {
      return;
    }

    const mimeType = pickRecorderMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    chunksRef.current = [];
    recorderRef.current = recorder;
    isRecordingRef.current = true;
    recordingStartedAtRef.current = Date.now();
    lastSpeechAtRef.current = Date.now();
    onBargeInRef.current?.();
    setMicStatus("recording");

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    });

    recorder.start(250);
  }, []);

  const monitorAudioRef = useRef<() => void>(() => {});

  monitorAudioRef.current = () => {
    const analyser = analyserRef.current;
    if (
      !analyser ||
      isMutedRef.current ||
      isTranscribingRef.current ||
      isDisabledRef.current
    ) {
      if (!isMutedRef.current && !isTranscribingRef.current && !isDisabledRef.current) {
        setMicStatus("listening");
      }
      monitorFrameRef.current = requestAnimationFrame(() => {
        monitorAudioRef.current();
      });
      return;
    }

    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);

    let sum = 0;
    for (const sample of buffer) {
      const normalized = (sample - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / buffer.length);
    const now = Date.now();
    const speaking = rms >= SPEECH_THRESHOLD;

    if (speaking) {
      lastSpeechAtRef.current = now;
      if (!isRecordingRef.current) {
        startRecording();
      }
    } else if (isRecordingRef.current) {
      const startedAt = recordingStartedAtRef.current ?? now;
      const speechDuration = now - startedAt;
      const silenceDuration = now - lastSpeechAtRef.current;

      if (silenceDuration >= SILENCE_MS && speechDuration >= MIN_SPEECH_MS) {
        void finishRecording();
      } else if (now - startedAt >= MAX_RECORDING_MS) {
        void finishRecording();
      }
    } else {
      setMicStatus("listening");
    }

    monitorFrameRef.current = requestAnimationFrame(() => {
      monitorAudioRef.current();
    });
  };

  const startMonitor = useCallback(() => {
    stopMonitor();
    monitorFrameRef.current = requestAnimationFrame(() => {
      monitorAudioRef.current();
    });
  }, [stopMonitor]);

  const ensureMicrophone = useCallback(async () => {
    if (streamRef.current) {
      return streamRef.current;
    }

    const config = await fetchVoiceConfig();
    const browserAudio = config.browserAudio.audio as MediaTrackConstraints;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: browserAudio ?? {
        echoCancellation: config.capture.echoCancellation,
        noiseSuppression: config.capture.noiseSuppression,
        autoGainControl: config.capture.autoGainControl,
        channelCount: config.capture.channelCount,
      },
      video: false,
    });

    streamRef.current = stream;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    return stream;
  }, []);

  const startListening = useCallback(async () => {
    if (disabled) {
      return;
    }

    try {
      setMicError(null);
      const stream = await ensureMicrophone();
      for (const track of stream.getAudioTracks()) {
        track.enabled = true;
      }

      setIsMuted(false);
      setMicStatus("listening");
      startMonitor();
    } catch (error) {
      setMicError(
        error instanceof Error
          ? error.message
          : "Microphone permission was denied.",
      );
      setIsMuted(true);
      setMicStatus("muted");
      releaseStream();
    }
  }, [disabled, ensureMicrophone, releaseStream, startMonitor]);

  const stopListening = useCallback(() => {
    stopRecorder();
    stopMonitor();

    if (streamRef.current) {
      for (const track of streamRef.current.getAudioTracks()) {
        track.enabled = false;
      }
    }

    setIsMuted(true);
    setMicStatus("muted");
  }, [stopMonitor, stopRecorder]);

  const toggleMute = useCallback(async () => {
    if (isMuted) {
      await startListening();
      return;
    }

    stopListening();
  }, [isMuted, startListening, stopListening]);

  useEffect(() => {
    return () => {
      releaseStream();
    };
  }, [releaseStream]);

  return {
    isMuted,
    micStatus,
    micError,
    toggleMute,
    startListening,
    stopListening,
  };
}
