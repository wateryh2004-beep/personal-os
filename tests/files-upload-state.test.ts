import { describe, expect, it } from "vitest";
import { canAbortPendingUpload, stalePendingCutoff } from "@/features/files/upload-state";

describe("Files pending upload cleanup", () => {
  it("allows aborting only an R2 pending record", () => {
    expect(canAbortPendingUpload({ storage_provider: "cloudflare_r2", storage_state: "pending" })).toBe(true);
    expect(canAbortPendingUpload({ storage_provider: "cloudflare_r2", storage_state: "available" })).toBe(false);
  });

  it("uses one hour as the stale pending threshold", () => {
    expect(stalePendingCutoff(new Date("2026-08-07T12:00:00.000Z"))).toBe("2026-08-07T11:00:00.000Z");
  });
});
