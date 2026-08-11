import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const transcribeLocalSpeech = vi.hoisted(() => vi.fn());
vi.mock("./localSpeechTranscription", () => ({ transcribeLocalSpeech }));

import {
  collectSpeechRecognitionText,
  createComposerSpeechRecognition,
  createSpeechRecognitionTranscriptTracker,
  detectSpeechRecognitionSupport,
  mixAndResampleAudio,
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
  desktop?: boolean;
}) {
  vi.stubGlobal("window", {
    isSecureContext: input.secure ?? true,
    location: { hostname: input.hostname ?? "localhost" },
    SpeechRecognition: input.SpeechRecognition,
    webkitSpeechRecognition: input.webkitSpeechRecognition,
    desktopBridge: input.desktop ? {} : undefined,
  });
  vi.stubGlobal("navigator", {
    language: "en-US",
    userAgent: "Test",
    ...(input.desktop ? { mediaDevices: { getUserMedia: vi.fn() } } : {}),
  });
  if (input.desktop) {
    vi.stubGlobal(
      "MediaRecorder",
      class {
        readonly state = "inactive";
      },
    );
    vi.stubGlobal(
      "AudioContext",
      class {
        close() {
          return Promise.resolve();
        }
      },
    );
  }
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
  resultIndex = 0,
): SpeechRecognitionEvent {
  return {
    resultIndex,
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
      mode: "browser",
      ctor: FakeSpeechRecognition,
    });
  });

  it("detects webkitSpeechRecognition", () => {
    installWindow({ webkitSpeechRecognition: FakeSpeechRecognition });

    expect(detectSpeechRecognitionSupport()).toEqual({
      supported: true,
      mode: "browser",
      ctor: FakeSpeechRecognition,
    });
  });

  it("uses local recognition in Electron when Chromium omits the browser API", () => {
    installWindow({ desktop: true });

    expect(detectSpeechRecognitionSupport()).toEqual({ supported: true, mode: "local" });
  });

  it("prefers reliable local recognition over Electron's browser constructor", () => {
    installWindow({ desktop: true, webkitSpeechRecognition: FakeSpeechRecognition });

    expect(detectSpeechRecognitionSupport()).toEqual({ supported: true, mode: "local" });
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

  it("mixes channels and resamples captured audio to 16 kHz", () => {
    const channels = [new Float32Array([0, 1, 0, -1]), new Float32Array([0, 0, 0, 0])];
    const output = mixAndResampleAudio({
      length: 4,
      numberOfChannels: 2,
      sampleRate: 32_000,
      getChannelData: (index: number) => channels[index]!,
    } as AudioBuffer);

    expect([...output]).toEqual([0, 0]);
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

  it("replaces interim text and does not duplicate replayed final result slots", () => {
    const tracker = createSpeechRecognitionTranscriptTracker();

    expect(tracker.update(makeRecognitionEvent([makeResult("hello wor", false)]))).toEqual({
      finalText: "",
      interimText: "hello wor",
    });
    expect(tracker.update(makeRecognitionEvent([makeResult("hello world", true)]))).toEqual({
      finalText: "hello world",
      interimText: "",
    });
    expect(
      tracker.update(
        makeRecognitionEvent(
          [makeResult("hello world", true), makeResult("from Chrome", false)],
          1,
        ),
      ),
    ).toEqual({
      finalText: "hello world",
      interimText: "from Chrome",
    });
    expect(
      tracker.update(
        makeRecognitionEvent([makeResult("hello world", true), makeResult("from Chrome", true)], 0),
      ),
    ).toEqual({
      finalText: "hello world from Chrome",
      interimText: "",
    });
  });

  it("retains deliberately repeated words when Chrome reports separate result slots", () => {
    const tracker = createSpeechRecognitionTranscriptTracker();

    expect(
      tracker.update(
        makeRecognitionEvent([makeResult("very", true), makeResult("very useful", true)]),
      ),
    ).toEqual({ finalText: "very very useful", interimText: "" });
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

  it("captures and locally transcribes audio when Electron has no browser recognizer", async () => {
    installWindow({ desktop: true });
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(stream);
    const instances: FakeMediaRecorder[] = [];
    class FakeMediaRecorder extends EventTarget {
      state: RecordingState = "inactive";
      readonly mimeType = "audio/webm";

      constructor(readonly stream: MediaStream) {
        super();
        instances.push(this);
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        this.dispatchEvent(
          Object.assign(new Event("dataavailable"), { data: new Blob([new Uint8Array([1])]) }),
        );
        this.dispatchEvent(new Event("stop"));
      }
    }
    const close = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = vi.fn().mockResolvedValue({
          length: 2,
          numberOfChannels: 1,
          sampleRate: 16_000,
          getChannelData: () => new Float32Array([0.25, -0.25]),
        });
        close = close;
      },
    );
    transcribeLocalSpeech.mockResolvedValue("local transcript");
    const onFinalText = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();
    const recognizer = createComposerSpeechRecognition({
      language: "en-US",
      onFinalText,
      onInterimText: vi.fn(),
      onError,
      onEnd,
    });

    recognizer.start();
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    recognizer.stop();

    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledOnce());
    expect(transcribeLocalSpeech).toHaveBeenCalledWith(
      new Float32Array([0.25, -0.25]),
      "en-US",
      expect.any(AbortSignal),
    );
    expect(onFinalText).toHaveBeenCalledWith("local transcript");
    expect(onError).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
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

  it("aborts and ignores late callbacks after disposal during interim delivery", () => {
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
    const recognizer = createComposerSpeechRecognition({
      language: "en-US",
      onFinalText,
      onInterimText,
      onError,
      onEnd,
    });
    const instance = instances[0]!;

    instance.dispatchEvent(
      Object.assign(new Event("result"), makeRecognitionEvent([makeResult("drafting", false)])),
    );
    expect(onInterimText).toHaveBeenLastCalledWith("drafting");

    recognizer.dispose();
    recognizer.dispose();
    instance.dispatchEvent(
      Object.assign(new Event("result"), makeRecognitionEvent([makeResult("too late", true)])),
    );
    instance.dispatchEvent(Object.assign(new Event("error"), { error: "network" }));
    instance.dispatchEvent(new Event("end"));

    expect(instance.abort).toHaveBeenCalledOnce();
    expect(onFinalText).not.toHaveBeenCalled();
    expect(onInterimText).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("stops final-result delivery immediately when disposal occurs in its callback", () => {
    const instances: FakeSpeechRecognition[] = [];
    class CapturingSpeechRecognition extends FakeSpeechRecognition {
      constructor() {
        super();
        instances.push(this);
      }
    }
    installWindow({ SpeechRecognition: CapturingSpeechRecognition });
    let recognizer: ReturnType<typeof createComposerSpeechRecognition>;
    const onFinalText = vi.fn(() => recognizer.dispose());
    const onInterimText = vi.fn();
    const onError = vi.fn();
    const onEnd = vi.fn();
    recognizer = createComposerSpeechRecognition({
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
        makeRecognitionEvent([makeResult("already final", true), makeResult("too late", false)]),
      ),
    );
    instance.dispatchEvent(new Event("end"));

    expect(onFinalText).toHaveBeenCalledWith("already final");
    expect(onInterimText).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(instance.abort).toHaveBeenCalledOnce();
  });
});
