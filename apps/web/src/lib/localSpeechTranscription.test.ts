import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { transcribeLocalSpeech } from "./localSpeechTranscription";

class FakeWorker extends EventTarget {
  static instance: FakeWorker | undefined;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  constructor() {
    super();
    FakeWorker.instance = this;
  }

  respond(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("localSpeechTranscription", () => {
  it("sends captured PCM to the worker and parses its transcript response", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const audio = new Float32Array([0.1, -0.2]);
    const result = transcribeLocalSpeech(audio, "sl-SI", new AbortController().signal);
    const worker = FakeWorker.instance!;

    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: "transcribe", requestId: 1, audio, language: "sl-SI" },
      [audio.buffer],
    );

    worker.respond({ type: "result", requestId: 1, text: "lokalni prepis" });
    await expect(result).resolves.toBe("lokalni prepis");
  });
});
