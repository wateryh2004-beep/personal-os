import { describe, expect, it } from "vitest";
import { hasSameOrigin } from "@/lib/auth/same-origin";
const make = (origin: string, host?: string, more: Record<string, string> = {}) => new Request("http://localhost:3000/api/content", { headers: { origin, ...(host ? { host } : {}), ...more } });
describe("content origin boundary behind Next's internal hostname", () => {
  it("accepts the actual browser authority despite Next's listening hostname", () => {
    expect(hasSameOrigin(make("http://127.0.0.1:3000", "127.0.0.1:3000"))).toBe(true);
    expect(hasSameOrigin(make("http://localhost:3000"))).toBe(true);
  });
  it("uses configured public origin rather than caller-controlled forwarding headers", () => {
    expect(hasSameOrigin(make("https://personal.example", "localhost:3000"), "https://personal.example/")).toBe(true);
    expect(hasSameOrigin(make("https://attacker.example", "attacker.example", { "x-forwarded-host": "attacker.example" }), "https://personal.example")).toBe(false);
  });
  it.each(["null", "https://attacker.example", "http://127.0.0.1:3001", "http://127.0.0.1:3000/path", "http://user@127.0.0.1:3000"])("rejects mismatching or non-origin values %s", (origin) => {
    expect(hasSameOrigin(make(origin, "127.0.0.1:3000", { "x-forwarded-host": "attacker.example" }))).toBe(false);
  });
  it("rejects malformed host lists and explicit cross-site requests", () => {
    expect(hasSameOrigin(make("http://localhost:3000", "localhost:3000,attacker.example"))).toBe(false);
    expect(hasSameOrigin(make("http://localhost:3000", "localhost:3000", { "sec-fetch-site": "cross-site" }))).toBe(false);
  });
});
