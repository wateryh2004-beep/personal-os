import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sw = readFileSync("public/sw.js", "utf8");
const lifecycle = readFileSync("src/components/pwa/pwa-lifecycle.tsx", "utf8");
const dialog = readFileSync("src/components/ui/dialog.tsx", "utf8");
const sheet = readFileSync("src/components/ui/sheet.tsx", "utf8");
const sidePanel = readFileSync("src/components/shared/side-panel-shell.tsx", "utf8");
const perfRoute = readFileSync("src/app/api/perf/route.ts", "utf8");
const perfReporter = readFileSync("src/components/performance/client-performance-reporter.tsx", "utf8");
const e2e = readFileSync("scripts/mobile-native-e2e.cjs", "utf8");

describe("mobile native experience contracts", () => {
  it("keeps authenticated data out of service-worker caches", () => {
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain('request.mode === "navigate"');
    expect(sw).toContain("fetch(request).catch");
    expect(sw).toContain('url.pathname.startsWith("/_next/static/")');
    expect(sw).not.toContain("/today\"");
    expect(sw).not.toContain("/notes\"");
  });

  it("registers the PWA worker and detects new deployments", () => {
    expect(lifecycle).toContain('navigator.serviceWorker.register("/sw.js"');
    expect(lifecycle).toContain('fetch("/api/version"');
    expect(lifecycle).toContain("SKIP_WAITING");
  });

  it("uses mobile history layers and suppresses automatic mobile focus", () => {
    expect(dialog).toContain("useMobileBackLayer");
    expect(sheet).toContain("useMobileBackLayer");
    expect(sidePanel).toContain("useMobileBackLayer");
    expect(dialog).toContain("event.preventDefault()");
    expect(sheet).toContain("event.preventDefault()");
    expect(sidePanel).toContain('matchMedia("(max-width: 767px)")');
  });

  it("reports timing-only private metrics", () => {
    expect(perfRoute).toContain("requireOwnerApi");
    expect(perfRoute).toContain('type: "client_perf"');
    expect(perfReporter).toContain("useReportWebVitals");
    expect(perfRoute).not.toContain("bodyText");
    expect(perfRoute).not.toContain("searchQuery");
  });

  it("covers all target phone widths in browser E2E", () => {
    expect(e2e).toContain("[360, 390, 412, 430]");
    expect(e2e).toContain("serviceWorker.ready");
    expect(e2e).toContain("history.back()");
  });
});
