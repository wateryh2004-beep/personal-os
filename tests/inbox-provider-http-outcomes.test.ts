import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/features/system-status/service", () => ({ recordStatusSafely: vi.fn() }));
import { graph, MicrosoftGraphError } from "@/lib/adapters/microsoft-graph/calendar";

afterEach(() => vi.unstubAllGlobals());
describe("single Graph create HTTP outcomes", () => {
  for (const code of [null, 0, {}, ["ErrorInvalidRequest"], "", "   ", undefined]) {
    it(`keeps malformed or empty Graph code ${JSON.stringify(code)} unknown`, async () => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ error: { code } }, { status: 400 }));
      vi.stubGlobal("fetch", fetch);
      await expect(graph("synthetic-token", "/me/events", { method: "POST", body: "{}" })).rejects.toMatchObject({ writeOutcome: "unknown" });
      expect(fetch).toHaveBeenCalledOnce();
    });
  }
  for (const status of [400, 401, 403, 404, 405, 413, 415, 422]) {
    it(`retains proof of a structured ${status} rejection without automatically retrying`, async () => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ error: { code: "ErrorInvalidRequest" } }, { status }));
      vi.stubGlobal("fetch", fetch);
      await expect(graph("synthetic-token", "/me/events", { method: "POST", body: "{}" })).rejects.toMatchObject({ writeOutcome: "not_written" });
      expect(fetch).toHaveBeenCalledOnce();
    });
  }
  for (const status of [408, 409, 429, 500, 503, 504]) {
    it(`keeps ${status} unknown even when its payload resembles a known error`, async () => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ error: { code: "ErrorInvalidRequest" } }, { status }));
      vi.stubGlobal("fetch", fetch);
      await expect(graph("synthetic-token", "/me/todo/lists/synthetic/tasks", { method: "POST", body: "{}" })).rejects.toMatchObject({ writeOutcome: "unknown" });
      expect(fetch).toHaveBeenCalledOnce();
    });
  }
  it("does not convert network or unstructured gateway failures into a safe retry", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValueOnce(new Response("gateway", { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(graph("synthetic-token", "/me/events", { method: "POST" })).rejects.toMatchObject({ writeOutcome: "unknown" });
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new MicrosoftGraphError("unclassified").writeOutcome).toBe("unknown");
  });
});
