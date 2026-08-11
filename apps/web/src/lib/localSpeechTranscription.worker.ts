import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import ortWasmFactoryUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

import { localSpeechErrorMessage, resolveLocalSpeechRuntimeAssets } from "./localSpeechRuntime";

const MODEL_ID = "onnx-community/whisper-tiny";

interface TranscriptionRequest {
  readonly type: "transcribe";
  readonly requestId: number;
  readonly audio: Float32Array;
  readonly language: string;
}

type TranscriptionResponse =
  | { readonly type: "result"; readonly requestId: number; readonly text: string }
  | { readonly type: "error"; readonly requestId: number; readonly message: string };

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | undefined;
let queue = Promise.resolve();

// Transformers.js defaults to loading ONNX Runtime from jsDelivr. Remote module
// loading is unreliable in Electron's custom-protocol worker and unnecessary
// because Vite already packages these files with the application.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = resolveLocalSpeechRuntimeAssets(
    globalThis.location.href,
    ortWasmFactoryUrl,
    ortWasmUrl,
  );
}
// With explicit local paths, preloading would only turn the local module into
// a blob URL. Electron's CSP intentionally permits same-origin scripts instead.
env.useWasmCache = false;

function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  transcriberPromise ??= pipeline("automatic-speech-recognition", MODEL_ID, {
    device: "wasm",
    dtype: "q4",
  });
  return transcriberPromise;
}

async function transcribe(request: TranscriptionRequest): Promise<void> {
  let response: TranscriptionResponse;
  try {
    const transcriber = await getTranscriber();
    const language = request.language.split("-")[0]?.toLowerCase() || undefined;
    const output = await transcriber(request.audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      task: "transcribe",
      ...(language ? { language } : {}),
    });
    response = { type: "result", requestId: request.requestId, text: output.text.trim() };
  } catch (cause) {
    // A failed model initialization must be retryable, for example after the
    // user's connection returns during the one-time model download.
    transcriberPromise = undefined;
    console.error("Local voice transcription failed", cause);
    response = {
      type: "error",
      requestId: request.requestId,
      message: localSpeechErrorMessage(cause),
    };
  }
  globalThis.postMessage(response, { transfer: [] });
}

globalThis.addEventListener("message", (event: MessageEvent<TranscriptionRequest>) => {
  if (event.data?.type !== "transcribe") return;
  queue = queue.then(() => transcribe(event.data));
});
