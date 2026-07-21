import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  collectSpeechRecognitionText,
  createComposerSpeechRecognition,
  detectSpeechRecognitionSupport,
  speechRecognitionErrorMessage,
} from "./speechRecognition";

class FakeSpeechRecognition extends EventTarget implements SpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onend: ((this: SpeechRecognition, ev: Event) => unknown) | null = null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null = null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

function installWindow(input: {
  SpeechRecognition?: (new () => SpeechRecognition) | undefined;
  webkitSpeechRecognition?: (new () => SpeechRecognition) | undefined;
  secure?: boolean;
  hostname?: string;
}) {
  vi.stubGlobal("window", {
    isSecureContext: input.secure ?? true,
    location: { hostname: input.hostname ?? "localhost" },
    SpeechRecognition: input.SpeechRecognition,
    webkitSpeechRecognition: input.webkitSpeechRecognition,
  });
  vi.stubGlobal("navigator", { language: "en-US", userAgent: "Test" });
}

function makeResult(transcript: string, isFinal: boolean): SpeechRecognitionResult {
  return {
    0: { transcript, confidence: 1 },
    length: 1,
    isFinal,
    item: (index: number) => ({ transcript, confidence: index === 0 ? 1 : 0 }),
    [Symbol.iterator]: function* () {
      yield { transcript, confidence: 1 };
    },
  } as SpeechRecognitionResult;
}

function makeRecognitionEvent(
  results: ReadonlyArray<SpeechRecognitionResult>,
): SpeechRecognitionEvent {
  return {
    resultIndex: 0,
    results: {
      length: results.length,
      item: (index: number) => results[index]!,
      ...Object.fromEntries(results.map((result, index) => [index, result])),
    },
  } as SpeechRecognitionEvent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("speechRecognition", () => {
  it("detects standard SpeechRecognition", () => {
    installWindow({ SpeechRecognition: FakeSpeechRecognition });

    expect(detectSpeechRecognitionSupport()).toEqual({
      supported: true,
      ctor: FakeSpeechRecognition,
    });
  });

  it("detects webkitSpeechRecognition", () => {
    installWindow({ webkitSpeechRecognition: FakeSpeechRecognition });

    expect(detectSpeechRecognitionSupport()).toEqual({
      supported: true,
      ctor: FakeSpeechRecognition,
    });
  });

  it("returns unsupported when no constructor exists", () => {
    installWindow({});

    expect(detectSpeechRecognitionSupport()).toEqual({
      supported: false,
      reason: "missing-api",
    });
  });

  it("returns unsupported in insecure non-local contexts", () => {
    installWindow({
      SpeechRecognition: FakeSpeechRecognition,
      secure: false,
      hostname: "app.test",
    });

    expect(detectSpeechRecognitionSupport()).toEqual({
      supported: false,
      reason: "insecure-context",
    });
  });

  it("maps known recognition errors", () => {
    expect(speechRecognitionErrorMessage("not-allowed")).toBe("Microphone permission denied.");
    expect(speechRecognitionErrorMessage("no-speech")).toBe("No speech detected.");
    expect(speechRecognitionErrorMessage("network")).toBe("Speech recognition network error.");
    expect(speechRecognitionErrorMessage("bad-grammar")).toBe("Voice dictation failed.");
  });

  it("collects final and interim transcript chunks", () => {
    const text = collectSpeechRecognitionText(
      makeRecognitionEvent([makeResult("hello", true), makeResult("world", false)]),
    );

    expect(text).toEqual({ finalText: "hello", interimText: "world" });
  });

  it("ignores empty transcript chunks", () => {
    const text = collectSpeechRecognitionText(makeRecognitionEvent([makeResult("   ", true)]));

    expect(text).toEqual({ finalText: "", interimText: "" });
  });

  it("configures and starts a composer recognizer", () => {
    const instances: FakeSpeechRecognition[] = [];
    class CapturingSpeechRecognition extends FakeSpeechRecognition {
      constructor() {
        super();
        instances.push(this);
      }
    }
    installWindow({ SpeechRecognition: CapturingSpeechRecognition });

    const recognizer = createComposerSpeechRecognition({
      language: "sl-SI",
      onFinalText: vi.fn(),
      onInterimText: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
    });
    recognizer.start();

    const instance = instances[0];
    expect(instance).toBeDefined();
    expect(instance!.continuous).toBe(true);
    expect(instance!.interimResults).toBe(true);
    expect(instance!.lang).toBe("sl-SI");
    expect(instance!.start).toHaveBeenCalledOnce();
  });

  it("forwards interim and final text, errors, and completion events", () => {
    const instances: FakeSpeechRecognition[] = [];
    class CapturingSpeechRecognition extends FakeSpeechRecognition {
      constructor() {
        super();
        instances.push(this);
      }
    }
    installWindow({ SpeechRecognition: CapturingSpeechRecognition });
    const onFinalText = vi.fn();
    const onInterimText = vi.fn();
    const onError = vi.fn();
    const onEnd = vi.fn();

    createComposerSpeechRecognition({
      language: "en-US",
      onFinalText,
      onInterimText,
      onError,
      onEnd,
    });

    const instance = instances[0]!;
    instance.dispatchEvent(
      Object.assign(
        new Event("result"),
        makeRecognitionEvent([makeResult("final", true), makeResult("interim", false)]),
      ),
    );
    instance.dispatchEvent(Object.assign(new Event("error"), { error: "no-speech" }));
    instance.dispatchEvent(new Event("end"));

    expect(onFinalText).toHaveBeenCalledWith("final");
    expect(onInterimText).toHaveBeenCalledWith("interim");
    expect(onError).toHaveBeenCalledWith("No speech detected.");
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
