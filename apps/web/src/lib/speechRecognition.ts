import { transcribeLocalSpeech } from "./localSpeechTranscription";

export type ComposerSpeechRecognitionConstructor = new () => SpeechRecognition;

export interface ComposerSpeechRecognition {
  start: () => void;
  stop: () => void;
  abort: () => void;
  dispose: (options?: { abort?: boolean }) => void;
}

export type SpeechRecognitionSupport =
  | { supported: true; mode: "browser"; ctor: ComposerSpeechRecognitionConstructor }
  | { supported: true; mode: "local" }
  | { supported: false; reason: "missing-api" | "insecure-context" };

declare global {
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
    abort: () => void;
    start: () => void;
    stop: () => void;
  }

  interface Window {
    SpeechRecognition?: ComposerSpeechRecognitionConstructor | undefined;
    webkitSpeechRecognition?: ComposerSpeechRecognitionConstructor | undefined;
  }
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isElectronRenderer(): boolean {
  if (typeof window !== "undefined" && window.desktopBridge !== undefined) return true;
  const userAgent = globalThis.navigator?.userAgent ?? "";
  return userAgent.includes("Electron");
}

function supportsLocalElectronRecognition(): boolean {
  return (
    isElectronRenderer() &&
    typeof globalThis.navigator?.mediaDevices?.getUserMedia === "function" &&
    typeof globalThis.MediaRecorder === "function" &&
    typeof globalThis.AudioContext === "function"
  );
}

export function detectSpeechRecognitionSupport(): SpeechRecognitionSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "missing-api" };
  }
  if (!window.isSecureContext && !isLocalhost(window.location.hostname) && !isElectronRenderer()) {
    return { supported: false, reason: "insecure-context" };
  }
  const ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (supportsLocalElectronRecognition()) return { supported: true, mode: "local" };
  if (ctor) return { supported: true, mode: "browser", ctor };
  return { supported: false, reason: "missing-api" };
}

export function speechRecognitionErrorMessage(error: SpeechRecognitionErrorCode | string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission denied.";
    case "no-speech":
      return "No speech detected.";
    case "network":
      return "Speech recognition network error.";
    default:
      return "Voice dictation failed.";
  }
}

export function collectSpeechRecognitionText(event: SpeechRecognitionEvent): {
  finalText: string;
  interimText: string;
} {
  const finalChunks: string[] = [];
  const interimChunks: string[] = [];
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    if (!result) continue;
    const transcript = result?.[0]?.transcript?.trim();
    if (!transcript) continue;
    if (result.isFinal) {
      finalChunks.push(transcript);
    } else {
      interimChunks.push(transcript);
    }
  }
  return {
    finalText: finalChunks.join(" ").trim(),
    interimText: interimChunks.join(" ").trim(),
  };
}

export function createSpeechRecognitionTranscriptTracker(): {
  update: (event: SpeechRecognitionEvent) => { finalText: string; interimText: string };
} {
  const finalTextByResultIndex = new Map<number, string>();

  return {
    update: (event) => {
      for (const index of finalTextByResultIndex.keys()) {
        if (index >= event.results.length) {
          finalTextByResultIndex.delete(index);
        }
      }

      const interimChunks: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        const transcript = result[0]?.transcript?.trim();
        if (!transcript) {
          if (index >= event.resultIndex) finalTextByResultIndex.delete(index);
          continue;
        }
        if (result.isFinal) {
          finalTextByResultIndex.set(index, transcript);
        } else {
          finalTextByResultIndex.delete(index);
          interimChunks.push(transcript);
        }
      }

      return {
        finalText: [...finalTextByResultIndex.entries()]
          .toSorted(([left], [right]) => left - right)
          .map(([, transcript]) => transcript)
          .join(" ")
          .trim(),
        interimText: interimChunks.join(" ").trim(),
      };
    },
  };
}

export function mixAndResampleAudio(buffer: AudioBuffer, targetSampleRate = 16_000): Float32Array {
  const sourceSampleRate = buffer.sampleRate;
  const outputLength = Math.floor((buffer.length * targetSampleRate) / sourceSampleRate);
  if (outputLength <= 0 || buffer.numberOfChannels <= 0) return new Float32Array();

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  );
  const output = new Float32Array(outputLength);
  const sourceStep = sourceSampleRate / targetSampleRate;
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition = outputIndex * sourceStep;
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(lowerIndex + 1, buffer.length - 1);
    const fraction = sourcePosition - lowerIndex;
    let mixedSample = 0;
    for (const channel of channels) {
      const lower = channel[lowerIndex] ?? 0;
      const upper = channel[upperIndex] ?? lower;
      mixedSample += lower + (upper - lower) * fraction;
    }
    output[outputIndex] = mixedSample / channels.length;
  }
  return output;
}

function localRecognitionErrorMessage(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") {
    return "Microphone permission denied. Allow microphone access in system settings and try again.";
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return "Local voice transcription failed.";
}

function createLocalComposerSpeechRecognition(input: {
  language: string;
  onFinalText: (text: string) => void;
  onInterimText: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): ComposerSpeechRecognition {
  const abortController = new AbortController();
  const chunks: Blob[] = [];
  let recorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let disposed = false;
  let stopRequested = false;

  const stopTracks = () => {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = undefined;
  };
  const fail = (cause: unknown) => {
    stopTracks();
    if (disposed) return;
    input.onError(localRecognitionErrorMessage(cause));
  };
  const finish = async () => {
    stopTracks();
    if (disposed) return;
    let audioContext: AudioContext | undefined;
    try {
      if (chunks.length === 0) throw new Error("No speech detected.");
      audioContext = new AudioContext();
      const mimeType = recorder?.mimeType;
      const encodedAudio = await new Blob(
        chunks,
        mimeType ? { type: mimeType } : undefined,
      ).arrayBuffer();
      const decodedAudio = await audioContext.decodeAudioData(encodedAudio);
      const samples = mixAndResampleAudio(decodedAudio);
      if (samples.length === 0) throw new Error("No speech detected.");
      const text = await transcribeLocalSpeech(samples, input.language, abortController.signal);
      if (disposed) return;
      if (!text.trim()) throw new Error("No speech detected.");
      input.onFinalText(text);
      if (!disposed) input.onInterimText("");
      if (!disposed) input.onEnd();
    } catch (cause) {
      fail(cause);
    } finally {
      await audioContext?.close().catch(() => undefined);
    }
  };

  const start = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed) {
        stopTracks();
        return;
      }
      recorder = new MediaRecorder(stream);
      recorder.addEventListener("dataavailable", (event) => {
        if (!disposed && event.data.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener("error", (event) => fail(event.error), { once: true });
      recorder.addEventListener("stop", () => void finish(), { once: true });
      recorder.start();
      if (stopRequested && recorder.state !== "inactive") recorder.stop();
    } catch (cause) {
      fail(cause);
    }
  };

  const stop = () => {
    stopRequested = true;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };
  const dispose = (options?: { abort?: boolean }) => {
    if (disposed) return;
    disposed = true;
    abortController.abort();
    if (options?.abort !== false && recorder && recorder.state !== "inactive") recorder.stop();
    stopTracks();
  };

  return { start: () => void start(), stop, abort: dispose, dispose };
}

export function createComposerSpeechRecognition(input: {
  language: string;
  onFinalText: (text: string) => void;
  onInterimText: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): ComposerSpeechRecognition {
  const support = detectSpeechRecognitionSupport();
  if (!support.supported) {
    throw new Error(
      support.reason === "insecure-context"
        ? "Voice dictation requires a secure browser context."
        : "Voice dictation is not supported in this browser.",
    );
  }

  if (support.mode === "local") return createLocalComposerSpeechRecognition(input);

  const recognition = new support.ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = input.language || "en-US";
  const transcriptTracker = createSpeechRecognitionTranscriptTracker();
  let disposed = false;
  const handleResult = (event: Event) => {
    if (disposed) return;
    const speechEvent = event as SpeechRecognitionEvent;
    const text = transcriptTracker.update(speechEvent);
    if (text.finalText) {
      input.onFinalText(text.finalText);
    }
    if (disposed) return;
    input.onInterimText(text.interimText);
  };
  const handleError = (event: Event) => {
    if (disposed) return;
    const speechEvent = event as SpeechRecognitionErrorEvent;
    input.onError(speechRecognitionErrorMessage(speechEvent.error));
  };
  const handleEnd = () => {
    if (disposed) return;
    input.onEnd();
  };
  recognition.addEventListener("result", handleResult);
  recognition.addEventListener("error", handleError);
  recognition.addEventListener("end", handleEnd);

  const dispose = (options?: { abort?: boolean }) => {
    if (disposed) return;
    disposed = true;
    recognition.removeEventListener("result", handleResult);
    recognition.removeEventListener("error", handleError);
    recognition.removeEventListener("end", handleEnd);
    if (options?.abort !== false) {
      recognition.abort();
    }
  };

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: dispose,
    dispose,
  };
}
