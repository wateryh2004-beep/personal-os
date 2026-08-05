import { describe, expect, it } from "vitest";
import { sealSecret, unsealSecret } from "@/lib/crypto/sealed-secret";

describe("Microsoft Calendar credential encryption", () => {
  it("round-trips a refresh credential without preserving its plaintext", async () => {
    const encrypted = sealSecret("refresh-token-for-test-only", "test-server-only-secret");
    expect(encrypted).not.toContain("refresh-token-for-test-only");
    expect(unsealSecret(encrypted, "test-server-only-secret")).toBe("refresh-token-for-test-only");
  });

  it("rejects a changed ciphertext instead of returning a token", async () => {
    const encrypted = sealSecret("refresh-token-for-test-only", "test-server-only-secret");
    const parts = encrypted.split(".");
    parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith("A") ? "B" : "A"}`;
    expect(() => unsealSecret(parts.join("."), "test-server-only-secret")).toThrow("sealed_secret_invalid");
  });
});
