import * as React from "react";
import * as Schema from "effect/Schema";

import { clipboardFeedbackController, type ClipboardOperationStatus } from "../clipboardFeedback";

export class ClipboardApiUnavailableError extends Schema.TaggedErrorClass<ClipboardApiUnavailableError>()(
  "ClipboardApiUnavailableError",
  {
    target: Schema.String,
  },
) {
  override get message(): string {
    return `Clipboard access is unavailable while copying ${this.target}. Use a secure browser window and allow clipboard permission, then try again.`;
  }
}

export class ClipboardWriteError extends Schema.TaggedErrorClass<ClipboardWriteError>()(
  "ClipboardWriteError",
  {
    target: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to copy ${this.target}. Check your browser clipboard permission, then try again.`;
  }
}

export type ClipboardWriteVerification = "matched" | "mismatched" | "unavailable";

export async function verifyClipboardWriteBestEffort(
  expectedValue: string,
): Promise<ClipboardWriteVerification> {
  if (
    typeof document === "undefined" ||
    !document.hasFocus() ||
    typeof navigator === "undefined" ||
    !navigator.clipboard?.readText ||
    !navigator.permissions?.query
  ) {
    return "unavailable";
  }

  try {
    const permission = await navigator.permissions.query({
      name: "clipboard-read" as PermissionName,
    });
    if (permission.state !== "granted") return "unavailable";
    return (await navigator.clipboard.readText()) === expectedValue ? "matched" : "mismatched";
  } catch {
    return "unavailable";
  }
}

export async function writeTextToClipboard(
  value: string,
  target = "text",
  {
    announceSuccess = true,
    announceFailure = true,
  }: { announceSuccess?: boolean; announceFailure?: boolean } = {},
) {
  if (!value) return false;

  const operationId = clipboardFeedbackController.start(target);
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    !navigator.clipboard?.writeText
  ) {
    const error = new ClipboardApiUnavailableError({
      target,
    });
    clipboardFeedbackController.fail(operationId, target, error, announceFailure);
    throw error;
  }

  try {
    await navigator.clipboard.writeText(value);
    const verification = await verifyClipboardWriteBestEffort(value);
    if (verification === "mismatched") {
      throw new Error("The clipboard changed before the copy could be confirmed.");
    }
    clipboardFeedbackController.succeed(operationId, target, announceSuccess);
    return true;
  } catch (cause) {
    const error = new ClipboardWriteError({
      target,
      cause,
    });
    clipboardFeedbackController.fail(operationId, target, error, announceFailure);
    throw error;
  }
}

export function useCopyToClipboard<TContext = void>({
  timeout = 2000,
  target = "text",
  onCopy,
  onError,
}: {
  timeout?: number;
  target?: string;
  onCopy?: (ctx: TContext) => void;
  onError?: (error: Error, ctx: TContext) => void;
} = {}): {
  copyToClipboard: (value: string, ctx: TContext) => void;
  isCopied: boolean;
  status: "idle" | ClipboardOperationStatus;
  error: Error | null;
} {
  const [isCopied, setIsCopied] = React.useState(false);
  const [status, setStatus] = React.useState<"idle" | ClipboardOperationStatus>("idle");
  const [error, setError] = React.useState<Error | null>(null);
  const timeoutIdRef = React.useRef<NodeJS.Timeout | null>(null);
  const operationIdRef = React.useRef(0);
  const onCopyRef = React.useRef(onCopy);
  const onErrorRef = React.useRef(onError);
  const targetRef = React.useRef(target);
  const timeoutRef = React.useRef(timeout);

  onCopyRef.current = onCopy;
  onErrorRef.current = onError;
  targetRef.current = target;
  timeoutRef.current = timeout;

  const copyToClipboard = React.useCallback((value: string, ctx: TContext): void => {
    const hookOperationId = ++operationIdRef.current;
    setStatus("pending");
    setError(null);
    void writeTextToClipboard(value, targetRef.current, {
      announceSuccess: onCopyRef.current === undefined,
      announceFailure: onErrorRef.current === undefined,
    }).then(
      (didCopy) => {
        if (operationIdRef.current !== hookOperationId) return;
        if (!didCopy) {
          setStatus("idle");
          return;
        }
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current);
        }
        setIsCopied(true);
        setStatus("success");

        onCopyRef.current?.(ctx);

        if (timeoutRef.current !== 0) {
          timeoutIdRef.current = setTimeout(() => {
            setIsCopied(false);
            timeoutIdRef.current = null;
          }, timeoutRef.current);
        }
      },
      (error) => {
        if (operationIdRef.current !== hookOperationId) return;
        console.error(error);
        const clipboardError =
          error instanceof Error ? error : new Error("Clipboard write failed.");
        setIsCopied(false);
        setStatus("failure");
        setError(clipboardError);
        onErrorRef.current?.(clipboardError, ctx);
      },
    );
  }, []);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return (): void => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  return { copyToClipboard, isCopied, status, error };
}
