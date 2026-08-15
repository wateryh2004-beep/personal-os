import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidecar = readFileSync("src/components/ai/ai-sidecar.tsx", "utf8");
const inspector = readFileSync("src/components/shared/inspector.tsx", "utf8");
const appShell = readFileSync("src/components/layout/app-shell.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");

describe("workspace panel layout contract", () => {
  it("keeps AI panels out of the desktop document flow", () => {
    expect(sidecar).toContain("fixed bottom-0 right-0 top-[var(--toolbar-height)]");
    expect(sidecar).toContain("md:w-[min(420px,calc(100vw-8px))]");
    expect(sidecar).not.toContain("lg:static");
    expect(sidecar).not.toContain("lg:shrink-0");
  });

  it("keeps inspectors out of the desktop document flow", () => {
    expect(inspector).toContain("fixed bottom-0");
    expect(inspector).toContain("md:top-[var(--toolbar-height)]");
    expect(inspector).toContain("md:w-[min(360px,calc(100vw-8px))]");
    expect(inspector).not.toContain("xl:static");
    expect(inspector).not.toContain("xl:shrink-0");
  });

  it("does not persist Global Agent panel visibility", () => {
    expect(appShell).not.toContain("personal-os:agent:panel-open");
    expect(appShell).not.toContain("agentOpenStorageKey");
    expect(appShell).toContain("WorkspacePanelProvider");
  });

  it("prevents body-level horizontal overflow", () => {
    expect(globals).toMatch(/body\s*\{[^}]*overflow-x\s*:\s*(hidden|clip)/);
  });
});
