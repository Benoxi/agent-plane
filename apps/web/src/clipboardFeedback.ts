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
  #lastAnnouncedSuccess: { target: string; at: number } | null = null;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  subscribe(listener: ClipboardFeedbackListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(target: string): number {
    const operationId = this.#nextOperationId++;
    this.#emit({ operationId, target, status: "pending", announce: false });
    return operationId;
  }

  succeed(operationId: number, target: string, allowAnnouncement = true): void {
    const now = this.#now();
    const announce = allowAnnouncement
      ? this.#lastAnnouncedSuccess === null ||
        this.#lastAnnouncedSuccess.target !== target ||
        now - this.#lastAnnouncedSuccess.at >= DUPLICATE_SUCCESS_WINDOW_MS
      : false;
    if (announce) {
      this.#lastAnnouncedSuccess = { target, at: now };
    }
    this.#emit({ operationId, target, status: "success", announce });
  }

  fail(operationId: number, target: string, error: Error, allowAnnouncement = true): void {
    this.#emit({ operationId, target, status: "failure", announce: allowAnnouncement, error });
  }

  #emit(event: ClipboardFeedbackEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }
}

export const clipboardFeedbackController = new ClipboardFeedbackController();
