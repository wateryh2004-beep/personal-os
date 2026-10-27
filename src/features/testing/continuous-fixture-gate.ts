/** Fixture selection never supplies a real user/session or grants backend access. */
export const continuousFixtureCookie = "personal-os-continuous-fixture=synthetic-v3";
const compiled = process.env.CONTINUOUS_FIXTURE_COMPILED === "1";
const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
function selected(url: string, cookies: string) {
  let parsed: URL; try { parsed = new URL(url); } catch { return false; }
  return parsed.protocol === "http:" && loopback.has(parsed.hostname)
    && cookies.split(";").map(value => value.trim()).includes(continuousFixtureCookie);
}
/** Compiled to false in every ordinary build; runtime environment cannot enable it. */
export function isContinuousFixtureClient() {
  return compiled && typeof window !== "undefined" && selected(window.location.href, document.cookie);
}
export function assertContinuousFixtureTransport(value: unknown) {
  if (value !== undefined && !isContinuousFixtureClient()) throw new Error("fixture_transport_forbidden");
}
/** Runtime gate selects only the isolated synthetic route, never Supabase auth. */
export function isContinuousFixtureRequest(url: string, cookieHeader: string | null) {
  return compiled && process.env.CONTINUOUS_WORKFLOWS_E2E_RUNTIME === "1" && process.env.CI === "true"
    && process.env.VERCEL !== "1" && process.env.VERCEL_ENV !== "production"
    && selected(url, cookieHeader ?? "");
}
