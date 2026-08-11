import { describe, expect, it } from "vite-plus/test";

import { formatResetAt, formatResetDateTime } from "./limitsFormat.ts";

describe("limit reset formatting", () => {
  it("rejects missing and invalid reset timestamps", () => {
    expect(formatResetAt(null, 0)).toBeNull();
    expect(formatResetDateTime("not-a-date")).toBeNull();
  });

  it("includes an explicit timezone in detailed reset text", () => {
    const formatted = formatResetDateTime("2026-08-11T14:00:00.000Z");
    expect(formatted).not.toBeNull();
    expect(formatted).toMatch(/(?:GMT|UTC|CEST|CET|[AP]M)/u);
  });
});
