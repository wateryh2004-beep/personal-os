import { describe, expect, it, vi } from "vitest";
import { withSupabaseReadRecovery } from "@/lib/adapters/supabase-read-recovery";
const origin = "https://project.supabase.test";
const refused = (status = 401, code = "PGRST303") => Response.json({ code, message: "Synthetic rejection" }, { status });
const authorization = { Authorization: "Bearer synthetic-jwt" };

describe("bounded provider read recovery", () => {
  it.each(["GET", "POST"])("replays a %s read exactly once after revalidation", async method => {
    const path = method === "POST" ? "/rest/v1/rpc/search_personal_os" : "/rest/v1/notes?select=id";
    const original = { method, headers: authorization, ...(method === "POST" ? { body: '{"p_query":"合成"}' } : {}) };
    const base = vi.fn<typeof fetch>().mockResolvedValueOnce(refused()).mockResolvedValueOnce(Response.json([]));
    const verify = vi.fn().mockResolvedValue(true);
    const read = withSupabaseReadRecovery(base, origin, verify);
    expect((await read(origin + path, original)).status).toBe(200);
    expect(verify).toHaveBeenCalledExactlyOnceWith("synthetic-jwt");
    expect(base).toHaveBeenNthCalledWith(2, origin + path, original);
  });
  it.each([
    ["POST", "/rest/v1/notes", 401, "PGRST303"],
    ["PATCH", "/rest/v1/notes", 401, "PGRST303"],
    ["DELETE", "/rest/v1/notes", 401, "PGRST303"],
    ["POST", "/rest/v1/rpc/save_note", 401, "PGRST303"],
    ["GET", "/rest/v1/rpc/save_note", 401, "PGRST303"],
    ["GET", "/rest/v1/notes", 403, "42501"],
    ["GET", "/rest/v1/notes", 401, "42501"],
    ["GET", "/rest/v1/notes", 401, "PGRST301"],
    ["GET", "/auth/v1/user", 401, "PGRST303"],
  ])("does not replay %s %s / %s %s", async (method, path, status, code) => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(refused(Number(status), String(code)));
    const verify = vi.fn();
    const read = withSupabaseReadRecovery(base, origin, verify);
    expect((await read(origin + path, { method: String(method), headers: authorization, body: method === "POST" ? "{}" : undefined })).status).toBe(status);
    expect(base).toHaveBeenCalledOnce(); expect(verify).not.toHaveBeenCalled();
  });
  it("never sends recovery credentials to a foreign origin", async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(refused());
    const verify = vi.fn();
    await withSupabaseReadRecovery(base, origin, verify)("https://foreign.test/rest/v1/notes", { headers: authorization });
    expect(base).toHaveBeenCalledOnce(); expect(verify).not.toHaveBeenCalled();
  });
  it.each([false, "throw"])("preserves the refusal if revalidation fails (%s)", async state => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(refused());
    const verify = vi.fn(async () => { if (state === "throw") throw Error("offline"); return false; });
    expect((await withSupabaseReadRecovery(base, origin, verify)(origin + "/rest/v1/notes", { headers: authorization })).status).toBe(401);
    expect(base).toHaveBeenCalledOnce();
  });
  it("shares one revalidation across parallel failures without sharing across clients", async () => {
    const counts = new Map<string, number>();
    const base = vi.fn<typeof fetch>(async input => {
      const key = String(input), count = (counts.get(key) ?? 0) + 1; counts.set(key, count);
      return count === 1 ? refused() : Response.json([]);
    });
    const verify = vi.fn().mockResolvedValue(true);
    const read = withSupabaseReadRecovery(base, origin, verify);
    expect((await Promise.all(["notes", "note_folders"].map(table => read(`${origin}/rest/v1/${table}`, { headers: authorization })))).every(r => r.status === 200)).toBe(true);
    expect(verify).toHaveBeenCalledOnce(); expect(base).toHaveBeenCalledTimes(4);
    const separate = withSupabaseReadRecovery(vi.fn<typeof fetch>().mockResolvedValue(refused()), origin, verify);
    expect((await separate(origin + "/rest/v1/notes", { headers: authorization })).status).toBe(401);
    expect(verify).toHaveBeenCalledTimes(2);
  });
  it("returns the second actual refusal without a retry loop", async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(refused());
    expect((await withSupabaseReadRecovery(base, origin, async () => true)(origin + "/rest/v1/notes", { headers: authorization })).status).toBe(401);
    expect(base).toHaveBeenCalledTimes(2);
  });
});
