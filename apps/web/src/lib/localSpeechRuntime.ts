interface LocalSpeechRuntimeAssets {
  readonly mjs: string;
  readonly wasm: string;
}

export function resolveLocalSpeechRuntimeAssets(
  workerUrl: string,
  mjsUrl: string,
  wasmUrl: string,
): LocalSpeechRuntimeAssets {
  return {
    mjs: new URL(mjsUrl, workerUrl).href,
    wasm: new URL(wasmUrl, workerUrl).href,
  };
}

export function localSpeechErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message.trim() : "";
  if (
    /networkerror|failed to fetch|fetch failed|unauthorized|forbidden|status (?:401|403|404)/iu.test(
      message,
    )
  ) {
    return "The local speech model could not be downloaded. Check your connection and try again.";
  }
  if (message) return `Local voice transcription failed: ${message}`;
  return "Local voice transcription failed. Try again or check the microphone input.";
}
