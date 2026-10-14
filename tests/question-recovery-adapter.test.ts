import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), getUser: vi.fn(), generate: vi.fn(), verify: vi.fn(), update: vi.fn(), signOut: vi.fn(), client: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: {
  supabaseUrl: "https://supabase.example.test", supabasePublishableKey: "publishable-test-key", supabaseSecretKey: "secret-test-key",
  ownerEmail: "owner@example.com", ownerUserId: "11111111-1111-4111-8111-111111111111",
} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: mocks.rpc, auth: { admin: { getUserById: mocks.getUser, generateLink: mocks.generate } },
}) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));

import { consumeQuestionRecoveryAttempt, isQuestionRecoveryConfigured, resetOwnerPasswordFromQuestion } from "@/lib/adapters/question-password-recovery";

const owner = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OWNER_EMAIL", owner.email);
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("PASSWORD_RECOVERY_ANSWER_HASH", `scrypt-v1:${"a".repeat(32)}:${"b".repeat(64)}`);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: owner }, error: null });
  mocks.generate.mockResolvedValue({ data: { user: owner, properties: { hashed_token: "private-token" } }, error: null });
  mocks.verify.mockResolvedValue({ data: { user: owner, session: { access_token: "private-session" } }, error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.client.mockReturnValue({ auth: { verifyOtp: mocks.verify, updateUser: mocks.update, signOut: mocks.signOut } });
});
afterEach(() => vi.unstubAllEnvs());

describe("server-only recovery adapter", () => {
  it("disables question recovery on public previews and without a verifier", () => {
    expect(isQuestionRecoveryConfigured()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isQuestionRecoveryConfigured()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PASSWORD_RECOVERY_ANSWER_HASH", "");
    expect(isQuestionRecoveryConfigured()).toBe(false);
  });
  it("requires a boolean limit result; missing RPC fails closed", async () => {
    expect(await consumeQuestionRecoveryAttempt()).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("consume_question_recovery_attempt");
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("missing RPC") });
    await expect(consumeQuestionRecoveryAttempt()).rejects.toThrow();
  });
  it("keeps the one-time token and session server-side, updates the owner, and revokes refresh sessions", async () => {
    expect(await resetOwnerPasswordFromQuestion("new-password-123")).toEqual({ sessionsRevoked: true });
    expect(mocks.getUser).toHaveBeenCalledWith(owner.id);
    expect(mocks.generate).toHaveBeenCalledWith({ type: "recovery", email: owner.email });
    expect(mocks.client).toHaveBeenCalledWith("https://supabase.example.test", "publishable-test-key", { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    expect(mocks.verify).toHaveBeenCalledWith({ type: "recovery", token_hash: "private-token" });
    expect(mocks.update).toHaveBeenCalledWith({ password: "new-password-123" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
  it("does not mint a token when the configured UUID belongs to a different email", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...owner, email: "other@example.com" } }, error: null });
    await expect(resetOwnerPasswordFromQuestion("new-password-123")).rejects.toThrow();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not verify a token minted for another user", async () => {
    mocks.generate.mockResolvedValue({ data: { user: { ...owner, id: "other" }, properties: { hashed_token: "bad" } }, error: null });
    await expect(resetOwnerPasswordFromQuestion("new-password-123")).rejects.toThrow();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("rejects a non-owner recovery session and clears only that session", async () => {
    mocks.verify.mockResolvedValue({ data: { user: { ...owner, id: "other" }, session: {} }, error: null });
    await expect(resetOwnerPasswordFromQuestion("new-password-123")).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("clears the transient session without logging all devices out when password validation fails", async () => {
    mocks.update.mockResolvedValue({ error: new Error("weak password") });
    await expect(resetOwnerPasswordFromQuestion("new-password-123")).rejects.toThrow();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("reports password update success separately from revocation failure", async () => {
    mocks.signOut.mockRejectedValue(new Error("network unavailable"));
    expect(await resetOwnerPasswordFromQuestion("new-password-123")).toEqual({ sessionsRevoked: false });
  });
});
