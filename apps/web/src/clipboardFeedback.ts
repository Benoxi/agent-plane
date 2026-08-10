export type ClipboardOperationStatus = "pending" | "success" | "failure";

export type ClipboardFeedbackEvent = {
  readonly operationId: number;
  readonly target: string;
  readonly status: ClipboardOperationStatus;
  readonly announce: boolean;
  readonly error?: Error;
};

type ClipboardFeedbackListener = (event: ClipboardFeedbackEvent) => void;

const DUPLICATE_SUCCESS_WINDOW_MS = 1_000;

export class ClipboardFeedbackController {
  readonly #listeners = new Set<ClipboardFeedbackListener>();
  readonly #now: () => number;
  #nextOperationId = 1;
  #latestOperationId = 0;
  #lastAnnouncedSuccess: { dedupeKey: string; at: number } | null = null;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  subscribe(listener: ClipboardFeedbackListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(target: string): number {
    const operationId = this.#nextOperationId++;
    this.#latestOperationId = operationId;
    this.#emit({ operationId, target, status: "pending", announce: false });
    return operationId;
  }

  succeed(operationId: number, target: string, allowAnnouncement = true, dedupeKey = target): void {
    const now = this.#now();
    const announce =
      allowAnnouncement && operationId === this.#latestOperationId
        ? this.#lastAnnouncedSuccess === null ||
          this.#lastAnnouncedSuccess.dedupeKey !== dedupeKey ||
          now - this.#lastAnnouncedSuccess.at >= DUPLICATE_SUCCESS_WINDOW_MS
        : false;
    if (announce) {
      this.#lastAnnouncedSuccess = { dedupeKey, at: now };
    }
    this.#emit({ operationId, target, status: "success", announce });
  }

  fail(operationId: number, target: string, error: Error, allowAnnouncement = true): void {
    this.#emit({
      operationId,
      target,
      status: "failure",
      announce: allowAnnouncement && operationId === this.#latestOperationId,
      error,
    });
  }

  #emit(event: ClipboardFeedbackEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }
}

export const clipboardFeedbackController = new ClipboardFeedbackController();
