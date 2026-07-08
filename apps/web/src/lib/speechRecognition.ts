export type ComposerSpeechRecognitionConstructor = new () => SpeechRecognition;

export type SpeechRecognitionSupport =
  | { supported: true; ctor: ComposerSpeechRecognitionConstructor }
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
  const userAgent = globalThis.navigator?.userAgent ?? "";
  return userAgent.includes("Electron");
}

export function detectSpeechRecognitionSupport(): SpeechRecognitionSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "missing-api" };
  }
  if (!window.isSecureContext && !isLocalhost(window.location.hostname) && !isElectronRenderer()) {
    return { supported: false, reason: "insecure-context" };
  }
  const ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!ctor) {
    return { supported: false, reason: "missing-api" };
  }
  return { supported: true, ctor };
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

export function createComposerSpeechRecognition(input: {
  language: string;
  onFinalText: (text: string) => void;
  onInterimText: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): {
  start: () => void;
  stop: () => void;
  abort: () => void;
} {
  const support = detectSpeechRecognitionSupport();
  if (!support.supported) {
    throw new Error(
      support.reason === "insecure-context"
        ? "Voice dictation requires a secure browser context."
        : "Voice dictation is not supported in this browser.",
    );
  }

  const recognition = new support.ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = input.language || "en-US";
  recognition.addEventListener("result", (event) => {
    const speechEvent = event as SpeechRecognitionEvent;
    const text = collectSpeechRecognitionText(speechEvent);
    if (text.finalText) {
      input.onFinalText(text.finalText);
    }
    input.onInterimText(text.interimText);
  });
  recognition.addEventListener("error", (event) => {
    const speechEvent = event as SpeechRecognitionErrorEvent;
    input.onError(speechRecognitionErrorMessage(speechEvent.error));
  });
  recognition.addEventListener("end", () => {
    input.onEnd();
  });

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  };
}
