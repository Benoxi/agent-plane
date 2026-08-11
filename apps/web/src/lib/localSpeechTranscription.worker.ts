import { pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

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

function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  transcriberPromise ??= pipeline("automatic-speech-recognition", MODEL_ID, {
    device: "wasm",
    dtype: "q4",
  });
  return transcriberPromise;
}

function errorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  if (/fetch|network|download|load model|unauthorized|forbidden/iu.test(message)) {
    return "The local speech model could not be downloaded. Check your connection and try again.";
  }
  return "Local voice transcription failed. Try again or check the microphone input.";
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
    response = { type: "error", requestId: request.requestId, message: errorMessage(cause) };
  }
  globalThis.postMessage(response, { transfer: [] });
}

globalThis.addEventListener("message", (event: MessageEvent<TranscriptionRequest>) => {
  if (event.data?.type !== "transcribe") return;
  queue = queue.then(() => transcribe(event.data));
});
