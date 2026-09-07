import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tabBar = readFileSync("src/components/layout/mobile-tab-bar.tsx", "utf8");
const appShell = readFileSync("src/components/layout/app-shell.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");

describe("mobile tab bar contract", () => {
  it("only renders on mobile and sits above the safe-area inset", () => {
    expect(tabBar).toContain("md:hidden");
    expect(tabBar).toContain("var(--tab-bar-height)");
    expect(tabBar).toContain("var(--safe-area-bottom)");
  });

  it("renders primary tabs from the shared registry plus a More button", () => {
    expect(tabBar).toContain("mobileTabNavigation.map");
    expect(tabBar).not.toContain("const tabs");
    expect(tabBar).toContain("onOpenMore");
    expect(tabBar).toContain("更多");
  });

  it("keeps Link auto-prefetch disabled and uses explicit pointer/touch intent", () => {
    expect(tabBar).toContain("prefetch={false}");
    expect(tabBar).toContain("onPointerEnter");
    expect(tabBar).toContain("onPointerDown");
    expect(tabBar).toContain("onTouchStart");
    expect(tabBar).toContain("onIntent?.(href)");
  });

  it("receives shell-level pending feedback and opens the existing drawer", () => {
    expect(tabBar).toContain("pendingHref");
    expect(tabBar).toContain("aria-busy={pending || undefined}");
    expect(appShell).toContain("<MobileTabBar onOpenMore={() => setMobileOpen(true)} pendingHref={visiblePendingHref} onNavigate={beginNavigation} onIntent={prefetchNavigationTarget} />");
  });

  it("surfaces recently visited non-tab modules in the mobile drawer", () => {
    expect(appShell).toContain("getMobileRecentNavigation");
    expect(appShell).toContain("mobileRecentNavigation");
    expect(appShell).toContain("最近访问");
  });

  it("reserves tab-bar height on mobile in the design tokens", () => {
    expect(globals).toMatch(/--tab-bar-height:calc\(56px \+ env\(safe-area-inset-bottom\)\)/);
  });
});
