import { describe, expect, it } from "vite-plus/test";

import { localSpeechErrorMessage, resolveLocalSpeechRuntimeAssets } from "./localSpeechRuntime";

describe("resolveLocalSpeechRuntimeAssets", () => {
  it("keeps the ONNX runtime inside the packaged Electron origin", () => {
    expect(
      resolveLocalSpeechRuntimeAssets(
        "t3code://app/assets/localSpeechTranscription.worker.js",
        "/assets/ort-wasm.mjs",
        "/assets/ort-wasm.wasm",
      ),
    ).toEqual({
      mjs: "t3code://app/assets/ort-wasm.mjs",
      wasm: "t3code://app/assets/ort-wasm.wasm",
    });
  });

  it("only labels actual network failures as model download failures", () => {
    expect(localSpeechErrorMessage(new Error("Failed to fetch"))).toBe(
      "The local speech model could not be downloaded. Check your connection and try again.",
    );
    expect(
      localSpeechErrorMessage(new Error("Failed to load model because no backend is available")),
    ).toBe(
      "Local voice transcription failed: Failed to load model because no backend is available",
    );
  });
});
