import { describe, expect, it } from "vitest";
import { resolveRecoveryOrigin } from "@/lib/auth/recovery-origin";

describe("resolveRecoveryOrigin", () => {
  it("never uses localhost APP_URL in Vercel production", () => {
    expect(resolveRecoveryOrigin({
      configuredAppUrl: "http://localhost:3000",
      vercelEnv: "production",
      vercelProjectProductionUrl: "personal-os-kappa-nine.vercel.app",
    })).toBe("https://personal-os-kappa-nine.vercel.app");
  });

  it("keeps localhost for local development", () => {
    expect(resolveRecoveryOrigin({
      configuredAppUrl: "http://localhost:3000",
      vercelEnv: "development",
    })).toBe("http://localhost:3000");
  });

  it("prefers a valid configured production domain", () => {
    expect(resolveRecoveryOrigin({
      configuredAppUrl: "https://personal.example.com/",
      vercelEnv: "production",
      vercelProjectProductionUrl: "personal-os-kappa-nine.vercel.app",
    })).toBe("https://personal.example.com");
  });

  it("falls back to the forwarded production host", () => {
    expect(resolveRecoveryOrigin({
      configuredAppUrl: "http://localhost:3000",
      vercelEnv: "production",
      forwardedHost: "personal-os-kappa-nine.vercel.app",
      forwardedProto: "https",
    })).toBe("https://personal-os-kappa-nine.vercel.app");
  });
});
