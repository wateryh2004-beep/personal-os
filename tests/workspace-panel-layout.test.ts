import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidecar = readFileSync("src/components/ai/ai-sidecar.tsx", "utf8");
const inspector = readFileSync("src/components/shared/inspector.tsx", "utf8");
const sidePanelShell = readFileSync("src/components/shared/side-panel-shell.tsx", "utf8");
const appShell = readFileSync("src/components/layout/app-shell.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");

describe("workspace panel layout contract", () => {
  it("keeps AI panels out of the desktop document flow", () => {
    expect(sidecar).toContain("SidePanelShell");
    expect(sidecar).toContain('variant="assistant"');
    expect(sidePanelShell).toContain("fixed bottom-0 right-0 top-[var(--toolbar-height)]");
    expect(sidePanelShell).toContain("w-[min(420px,calc(100vw-8px))]");
    expect(sidePanelShell).not.toContain("lg:static");
    expect(sidePanelShell).not.toContain("lg:shrink-0");
  });

  it("keeps inspectors out of the desktop document flow", () => {
    expect(inspector).toContain("SidePanelShell");
    expect(sidePanelShell).toContain("fixed bottom-0 right-0 top-[var(--toolbar-height)]");
    expect(sidePanelShell).not.toContain("xl:static");
    expect(sidePanelShell).not.toContain("xl:shrink-0");
  });

  it("does not persist Global Agent panel visibility", () => {
    expect(appShell).not.toContain("personal-os:agent:panel-open");
    expect(appShell).not.toContain("agentOpenStorageKey");
    expect(appShell).toContain("WorkspacePanelProvider");
  });

  it("prevents body-level horizontal overflow", () => {
    expect(globals).toMatch(/body\s*\{[^}]*overflow-x\s*:\s*hidden/);
  });
});
