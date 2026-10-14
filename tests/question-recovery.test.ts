import { scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(), consume: vi.fn(), reset: vi.fn(),
}));
vi.mock("@/lib/adapters/question-password-recovery", () => ({
  isQuestionRecoveryConfigured: mocks.configured,
  consumeQuestionRecoveryAttempt: mocks.consume,
  resetOwnerPasswordFromQuestion: mocks.reset,
}));

import { questionPasswordResetAction } from "@/features/auth/question-recovery-action";
import { isRecoveryAnswerHash, verifyRecoveryAnswer } from "@/lib/auth/recovery-answer";

// Synthetic words only; the actual recovery verifier is never a repository fixture.
const salt = Buffer.alloc(16, 1);
const encodedHash = `scrypt-v1:${salt.toString("hex")}:${scryptSync("alpha\nbeta", salt, 32).toString("hex")}`;
function form(overrides: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ firstWord: "alpha", secondWord: "beta", password: "new-password-123", confirmPassword: "new-password-123", ...overrides })) result.set(key, value);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PASSWORD_RECOVERY_ANSWER_HASH", encodedHash);
  mocks.configured.mockReturnValue(true);
  mocks.consume.mockResolvedValue(true);
  mocks.reset.mockResolvedValue({ sessionsRevoked: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("recovery answer verification", () => {
  it("normalizes letter casing and surrounding spaces", async () => {
    expect(await verifyRecoveryAnswer(" ALPHA ", "BeTa", encodedHash)).toBe(true);
  });
  it.each([["beta", "alpha"], ["alpha", "gamma"], ["alpha beta", "beta"], ["", "beta"]])("rejects wrong or malformed words %s / %s", async (first, second) => {
    expect(await verifyRecoveryAnswer(first, second, encodedHash)).toBe(false);
  });
  it("fails closed for absent or malformed verifier configuration", async () => {
    expect(isRecoveryAnswerHash(undefined)).toBe(false);
    expect(isRecoveryAnswerHash("alpha and beta")).toBe(false);
    expect(await verifyRecoveryAnswer("alpha", "beta", "bad-hash")).toBe(false);
  });
});

describe("question reset action authorization", () => {
  it("resets only after the shared attempt limit and correct answer, ignoring client owner fields", async () => {
    const result = await questionPasswordResetAction({}, form({ firstWord: "ALPHA", secondWord: "Beta", user_id: "attacker", email: "attacker@example.com" }));
    expect(result).toEqual({ updated: true, message: "密码已更新，请返回登录。" });
    expect(mocks.consume).toHaveBeenCalledOnce();
    expect(mocks.reset).toHaveBeenCalledExactlyOnceWith("new-password-123");
    expect(mocks.consume.mock.invocationCallOrder[0]).toBeLessThan(mocks.reset.mock.invocationCallOrder[0]);
  });
  it("counts a wrong answer without changing the password", async () => {
    expect(await questionPasswordResetAction({}, form({ secondWord: "wrong" }))).toHaveProperty("error", "答案不正确，请重新填写。");
    expect(mocks.consume).toHaveBeenCalledOnce();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("rejects a correct answer once locked out", async () => {
    mocks.consume.mockResolvedValue(false);
    expect(await questionPasswordResetAction({}, form())).toHaveProperty("error");
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("does not fall back when the database limiter is unavailable", async () => {
    mocks.consume.mockRejectedValue(new Error("database down"));
    expect(await questionPasswordResetAction({}, form())).toHaveProperty("error");
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ password: "short" }, { confirmPassword: "different-password" }, { firstWord: "alpha beta" }, { secondWord: "x".repeat(65) }])("validates input before privileged operations: %j", async (override) => {
    expect(await questionPasswordResetAction({}, form(override))).toHaveProperty("error");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("rejects missing configuration and forged prior success state", async () => {
    mocks.configured.mockReturnValue(false);
    expect(await questionPasswordResetAction({ updated: true }, form())).toHaveProperty("error");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("does not serialize service errors or secrets", async () => {
    mocks.reset.mockRejectedValue(new Error("secret-token-private-password"));
    const result = await questionPasswordResetAction({}, form());
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain(encodedHash);
  });
  it("accurately reports an updated password if session revocation fails", async () => {
    mocks.reset.mockResolvedValue({ sessionsRevoked: false });
    const result = await questionPasswordResetAction({}, form());
    expect(result.updated).toBe(true);
    expect(result.message).toContain("旧会话退出未完成");
  });
});
