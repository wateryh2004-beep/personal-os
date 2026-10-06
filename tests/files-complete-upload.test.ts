import { describe, expect, it, vi } from "vitest";
import { completeFileUpload } from "@/features/files/complete-upload";
describe("idempotent browser completion retry", () => {
  it("retries the same ID after a lost response without a new POST or PUT", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce(Response.json({ ok: true, alreadyCompleted: true }));
    expect((await completeFileUpload("same-id", fetcher)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const call of fetcher.mock.calls) {
      expect(call[1]?.method).toBe("PATCH"); expect(JSON.parse(call[1]?.body as string)).toEqual({ documentId: "same-id" });
    }
  });
  it("does not retry corruption or authentication errors", async () => {
    for (const status of [401, 403, 409]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "blocked" }, { status }));
      expect((await completeFileUpload("id", fetcher)).status).toBe(status);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("bounds retries for ongoing server failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "uncertain" }, { status: 503 }));
    expect((await completeFileUpload("id", fetcher)).status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
