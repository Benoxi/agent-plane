interface TranscriptionResponse {
  readonly type: "result" | "error";
  readonly requestId: number;
  readonly text?: string;
  readonly message?: string;
}

interface PendingRequest {
  readonly resolve: (text: string) => void;
  readonly reject: (cause: Error) => void;
}

let worker: Worker | undefined;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./localSpeechTranscription.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.addEventListener("message", (event: MessageEvent<TranscriptionResponse>) => {
    const response = event.data;
    const pending = pendingRequests.get(response.requestId);
    if (!pending) return;
    pendingRequests.delete(response.requestId);
    if (response.type === "result") {
      pending.resolve(response.text ?? "");
    } else {
      pending.reject(new Error(response.message ?? "Local voice transcription failed."));
    }
  });
  worker.addEventListener("error", () => {
    const error = new Error("The local speech engine stopped unexpectedly. Try dictation again.");
    for (const pending of pendingRequests.values()) pending.reject(error);
    pendingRequests.clear();
    worker?.terminate();
    worker = undefined;
  });
  return worker;
}

export function transcribeLocalSpeech(
  audio: Float32Array,
  language: string,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) return Promise.reject(signal.reason);
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      pendingRequests.delete(requestId);
      reject(signal.reason);
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    pendingRequests.set(requestId, {
      resolve: (text) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(text);
      },
      reject: (cause) => {
        signal.removeEventListener("abort", handleAbort);
        reject(cause);
      },
    });
    try {
      getWorker().postMessage({ type: "transcribe", requestId, audio, language }, [audio.buffer]);
    } catch (cause) {
      pendingRequests.delete(requestId);
      signal.removeEventListener("abort", handleAbort);
      reject(cause);
    }
  });
}
