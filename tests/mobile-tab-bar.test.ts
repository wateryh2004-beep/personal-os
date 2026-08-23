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

  it("links four primary modules plus a More button", () => {
    expect(tabBar).toContain('href: "/today"');
    expect(tabBar).toContain('href: "/calendar"');
    expect(tabBar).toContain('href: "/tasks"');
    expect(tabBar).toContain('href: "/notes"');
    expect(tabBar).not.toContain('href: "/inbox"');
    expect(tabBar).toContain("onOpenMore");
  });

  it("is mounted in the shell wired to the existing drawer", () => {
    expect(appShell).toContain("<MobileTabBar onOpenMore={() => setMobileOpen(true)} />");
    expect(appShell).toContain('{ name: "Inbox", href: "/inbox"');
  });

  it("reserves tab-bar height on mobile in the design tokens", () => {
    expect(globals).toMatch(/--tab-bar-height:calc\(56px \+ env\(safe-area-inset-bottom\)\)/);
  });
});
