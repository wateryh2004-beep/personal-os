import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShell = readFileSync("src/components/layout/app-shell.tsx", "utf8");
const tabBar = readFileSync("src/components/layout/mobile-tab-bar.tsx", "utf8");
const commandPalette = readFileSync("src/components/search/global-command-palette-impl.tsx", "utf8");

describe("navigation transition feedback", () => {
  it("shows a restrained one-pixel progress indicator only after 180ms", () => {
    expect(appShell).toContain("window.setTimeout(() => setShowNavigationProgress(true), 180)");
    expect(appShell).toContain("data-navigation-progress");
    expect(appShell).toContain("h-px");
  });

  it("shares one pending-navigation state across desktop and mobile navigation", () => {
    expect(appShell).toContain("const [pendingHref, setPendingHref]");
    expect(appShell).toContain("pendingHref={visiblePendingHref}");
    expect(appShell).toContain("onNavigate={beginNavigation}");
    expect(tabBar).toContain("pending && \"opacity-60\"");
  });

  it("lets command-palette navigation participate in shell transition feedback", () => {
    expect(commandPalette).toContain("personal-os:navigation-start");
    expect(appShell).toContain('window.addEventListener("personal-os:navigation-start"');
  });

  it("derives command-palette destinations from the shared registry", () => {
    expect(commandPalette).toContain("commandPaletteNavigation.map");
    expect(commandPalette).not.toContain("const navigation = [");
  });

  it("uses controlled route prefetch and checks constrained networks first", () => {
    expect(appShell).toContain("if (shouldAvoidSpeculativePrefetch()) return;");
    expect(appShell).toContain("router.prefetch(href)");
    expect(appShell).toContain("backgroundWorkspacePrefetchTargets(pathname)");
    expect(appShell).toContain("prefetch={false}");
  });
});
