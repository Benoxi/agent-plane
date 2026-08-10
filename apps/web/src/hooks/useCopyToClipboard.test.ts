import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  ClipboardApiUnavailableError,
  ClipboardWriteError,
  verifyClipboardWriteBestEffort,
  writeTextToClipboard,
} from "./useCopyToClipboard";

describe("writeTextToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unavailable clipboard support with structural context", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});

    const error = await writeTextToClipboard("plan contents", "plan").then(
      () => undefined,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(ClipboardApiUnavailableError);
    expect(error).toMatchObject({
      target: "plan",
    });
    expect((error as Error).message).not.toContain("plan contents");
  });

  it("preserves the exact clipboard failure without exposing copied contents", async () => {
    const cause = new Error("browser clipboard failure");
    const writeText = vi.fn().mockRejectedValue(cause);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const error = await writeTextToClipboard("secret clipboard contents", "error-message").then(
      () => undefined,
      (failure: unknown) => failure,
    );

    expect(writeText).toHaveBeenCalledWith("secret clipboard contents");
    expect(error).toBeInstanceOf(ClipboardWriteError);
    expect(error).toMatchObject({
      target: "error-message",
      cause,
    });
    expect((error as Error).message).not.toContain("secret clipboard contents");
  });

  it("keeps empty values as a no-op when clipboard support is available", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(writeTextToClipboard("", "plan")).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("does not request clipboard reads when the API is unsupported", async () => {
    const query = vi.fn();
    vi.stubGlobal("document", { hasFocus: () => true });
    vi.stubGlobal("navigator", { clipboard: {}, permissions: { query } });

    await expect(verifyClipboardWriteBestEffort("private text")).resolves.toBe("unavailable");
    expect(query).not.toHaveBeenCalled();
  });

  it("only verifies clipboard contents after read permission is already granted", async () => {
    const readText = vi.fn().mockResolvedValue("expected");
    const query = vi.fn().mockResolvedValue({ state: "granted" });
    vi.stubGlobal("document", { hasFocus: () => true });
    vi.stubGlobal("navigator", { clipboard: { readText }, permissions: { query } });

    await expect(verifyClipboardWriteBestEffort("expected")).resolves.toBe("matched");
    expect(readText).toHaveBeenCalledOnce();
  });

  it("treats a permitted readback mismatch as inconclusive after a successful write", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue("newer clipboard value");
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { hasFocus: () => true });
    vi.stubGlobal("navigator", {
      clipboard: { writeText, readText },
      permissions: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });

    await expect(writeTextToClipboard("copied value", "message")).resolves.toBe(true);
  });
});
