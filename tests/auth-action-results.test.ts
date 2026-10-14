import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), getClaims: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { ownerEmail: "owner@example.com" }, isSupabaseConfigured: true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
import { loginAction } from "@/features/auth/actions";
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
const credentials = { email: "owner@example.com", password: "synthetic-password" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OWNER_EMAIL", credentials.email);
  auth.signInWithPassword.mockResolvedValue({ error: null, data: { session: { access_token: "never-serialize" } } });
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: "owner-id", email: credentials.email } }, error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("auth animation result boundaries", () => {
  it("returns only the success flag after the SDK has accepted login", async () => {
    await expect(loginAction({}, form(credentials))).resolves.toEqual({ authenticated: true });
    expect(auth.signInWithPassword).toHaveBeenCalledWith(credentials);
  });
  it("never accepts forged previous success or failed credentials", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "denied" } });
    const result = await loginAction({ authenticated: true }, form(credentials));
    expect(result.error).toBeTruthy(); expect(result.authenticated).toBeUndefined();
  });
  it("rejects non-owner login before touching Supabase", async () => {
    expect((await loginAction({}, form({ ...credentials, email: "someone@example.com" }))).error).toBeTruthy();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
