import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("core UI consistency polish", () => {
  it("uses the system visual foundation without stale font or browser chrome", () => {
    const layout = read("src/app/layout.tsx");
    const polish = read("src/app/ui-polish.css");

    expect(layout).toContain('import "./ui-polish.css"');
    expect(layout).toContain('themeColor: "#f5f5f7"');
    expect(layout).not.toContain("next/font/google");
    expect(polish).toContain("--separator:");
    expect(polish).toContain("--shadow-popover:");
    expect(polish).toContain("--shadow-dialog:");
    expect(polish).toContain("--shadow-panel:");
  });

  it("keeps overlays quiet and consistent", () => {
    const dialog = read("src/components/ui/dialog.tsx");
    const popover = read("src/components/ui/popover.tsx");
    const tooltip = read("src/components/ui/tooltip.tsx");
    const panel = read("src/components/shared/side-panel-shell.tsx");

    expect(dialog).toContain("shadow-[var(--shadow-dialog)]");
    expect(dialog).toContain("max-sm:bottom-0");
    expect(popover).toContain("shadow-[var(--shadow-popover)]");
    expect(tooltip).toContain("delayDuration = 420");
    expect(panel).toContain("border-[var(--separator)]");
    expect(panel).toContain("shadow-[var(--shadow-panel)]");
  });

  it("uses one loading rhythm across core workspaces", () => {
    const skeleton = read("src/components/ui/skeleton.tsx");
    const today = read("src/components/today/today-workspace-loader.tsx");
    const tasks = read("src/components/tasks/task-workspace-loader.tsx");
    const calendar = read("src/components/calendar/calendar-workspace-loader.tsx");
    const polish = read("src/app/ui-polish.css");

    expect(skeleton).toContain("ui-skeleton-shimmer");
    expect(skeleton).not.toContain("animate-pulse");
    expect(today).toContain("ui-skeleton-shimmer");
    expect(tasks).toContain("ui-skeleton-shimmer");
    expect(calendar).toContain("ui-skeleton-shimmer");
    expect(polish).toContain(".notes-editor-loading::before");
  });

  it("keeps mobile spacing aligned for the core workspaces", () => {
    const polish = read("src/app/ui-polish.css");
    const now = read("src/components/today/now-workspace.tsx");

    expect(polish).toContain('--page-inline-mobile: 16px');
    expect(polish).toContain('nav[aria-label="任务视图"]');
    expect(polish).toContain('article a[href^="/notes/"]');
    expect(polish).toContain("var(--tab-bar-height)");
    expect(now).toContain('className="now-workspace');
  });
});
