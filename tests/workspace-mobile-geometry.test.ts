import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile workspace geometry ownership", () => {
  it("lets the Notes list reserve folder-control space without row-dependent top overrides", () => {
    expect(read("src/components/notes/notes-workspace.tsx")).toContain("pt-14");
    for (const file of ["globals", "mobile-core-workspaces", "ui-polish", "calendar-notes-polish"]) {
      const css = read(`src/app/${file}.css`);
      const noteRules = [...css.matchAll(/main\.workspace-scroll:has\(article a\[href\^="\/notes\/"\]\)\s*\{([^}]+)\}/g)];
      for (const [, declarations] of noteRules) expect(declarations).not.toContain("padding-top");
    }
  });

  it("allocates a third mobile task column for the row menu", () => {
    expect(read("src/app/mobile-core-workspaces.css")).toContain("grid-template-columns: 36px minmax(0, 1fr) 36px !important");
  });

  it("reserves a separate close-control area in the mobile Notes navigator", () => {
    const source = read("src/components/notes/notes-workspace-shell.tsx");
    expect(source).toContain('className={onNavigate ? "mr-[52px]" : undefined}');
    expect(source).toContain('className={onNavigate ? "size-11" : undefined}');
  });

  it("does not apply full-screen blur to dialog or sheet scrims", () => {
    for (const component of ["dialog", "sheet"]) {
      const source = read(`src/components/ui/${component}.tsx`);
      const overlay = source.slice(source.indexOf(`function ${component === "dialog" ? "Dialog" : "Sheet"}Overlay`), source.indexOf(`function ${component === "dialog" ? "Dialog" : "Sheet"}Content`));
      expect(overlay).not.toContain("backdrop-blur");
    }
  });
});
