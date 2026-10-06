import { describe, expect, it } from "vitest";
import { cronAuthDiagnostics } from "@/features/calendar/cron-auth-diagnostics";

describe("payload-free cron authorization diagnostics", () => {
  it("distinguishes missing environment configuration from a missing header", () => {
    expect(cronAuthDiagnostics(undefined, "Bearer fixture")).toMatchObject({ secretPresent: false, headerPresent: true, bearerScheme: true });
    expect(cronAuthDiagnostics("fixture", null)).toMatchObject({ secretPresent: true, headerPresent: false, bearerScheme: false });
  });
  it("reports configuration formatting without disclosing either value", () => {
    const result = cronAuthDiagnostics(" fixture-secret\n", "Basic fixture-header");
    expect(result).toEqual({ secretPresent: true, headerPresent: true, bearerScheme: false, secretHasSurroundingWhitespace: true, secretHasNonAsciiOrControlCharacters: true });
    expect(Object.values(result).every((value) => typeof value === "boolean")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fixture");
  });
  it("treats ordinary printable ASCII configuration as header-safe", () => {
    expect(cronAuthDiagnostics("fixture-secret_123", "Bearer fixture-secret_123")).toEqual({ secretPresent: true, headerPresent: true, bearerScheme: true, secretHasSurroundingWhitespace: false, secretHasNonAsciiOrControlCharacters: false });
  });
});
