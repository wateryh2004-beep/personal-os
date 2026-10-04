import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("owner authorization clickjacking protection", () => {
  it("denies framing of login, consent, access management and OAuth routes", async () => {
    const rules = await config.headers!();
    expect(rules.map((rule) => rule.source)).toEqual(["/login", "/settings/connections/codex/:path*", "/api/oauth/:path*"]);
    for (const rule of rules) {
      expect(rule.headers).toContainEqual({ key: "Content-Security-Policy", value: "frame-ancestors 'none'" });
      expect(rule.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    }
  });
});
