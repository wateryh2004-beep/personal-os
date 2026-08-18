import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("interaction continuity contracts", () => {
  it("keeps navigation feedback local while a route is loading", () => {
    const shell = source("src/components/layout/app-shell.tsx");
    expect(shell).toContain("pendingHref");
    expect(shell).toContain('perfMark("navigation-click"');
    expect(shell).toContain('perfMeasure("navigation-ready"');
  });

  it("keeps desktop panel widths local and mobile panels non-resizable", () => {
    const panel = source("src/components/shared/side-panel-shell.tsx");
    const notes = source("src/components/notes/notes-workspace-shell.tsx");
    expect(panel).toContain("personal-os:panel-width");
    expect(panel).toContain("max-width: 767px");
    expect(panel).toContain("onDoubleClick={resetWidth}");
    expect(notes).toContain("personal-os:notes-navigator-width:v1");
  });

  it("uses a global quick-create layer rather than route-query navigation", () => {
    const palette = source("src/components/search/global-command-palette.tsx");
    const layer = source("src/components/shared/global-create-layer.tsx");
    expect(palette).not.toContain('/tasks?create=1');
    expect(palette).not.toContain('/calendar?create=1');
    expect(palette).toContain("personal-os:create-open");
    expect(layer).toContain("createMicrosoftTodoTaskAction");
    expect(layer).toContain("createCalendarEvent");
    expect(layer).toContain("captureInboxItem");
  });

  it("keeps reversible Inbox archive immediate and exposes Undo", () => {
    const inbox = source("src/components/inbox/inbox-workspace.tsx");
    expect(inbox).toContain('message: "已归档 Inbox 项"');
    expect(inbox).toContain("restoreInboxItem(initialInboxCaptureState, form)");
    expect(inbox).not.toContain("确认归档？");
  });

  it("uses optimistic archive plus rollback for files", () => {
    const files = source("src/components/files/files-workspace.tsx");
    expect(files).toContain("setArchivedRows");
    expect(files).toContain('message: "文件已归档"');
    expect(files).toContain("归档失败，文件仍保留在原位置");
  });

  it("persists master-list scroll without adding history state", () => {
    const hook = source("src/components/shared/use-workspace-scroll-restoration.ts");
    const tasks = source("src/components/tasks/task-workspace.tsx");
    const notes = source("src/components/notes/notes-workspace.tsx");
    expect(hook).toContain("saveWorkspaceSession");
    expect(hook).not.toContain("history.pushState");
    expect(tasks).toContain('useWorkspaceScrollRestoration("tasks:list")');
    expect(notes).toContain('useWorkspaceScrollRestoration("notes:list")');
  });

  it("routes Notes context actions to the full-screen notes chat workspace", () => {
    const palette = source("src/components/search/global-command-palette.tsx");
    const workspace = source("src/components/notes/notes-workspace.tsx");
    const chat = source("src/components/assistant/notes-library-chat.tsx");
    expect(palette).toContain('go("/notes/ask")');
    expect(workspace).toContain('router.push("/notes/ask")');
    expect(chat).toContain("notes-library");
    expect(chat).not.toContain("SidePanelShell");
  });

  it("does not capture contextual create while a user is editing text", () => {
    const registry = source("src/features/shortcuts/registry.ts");
    expect(registry).toContain("isEditableTarget(event.target)");
    expect(registry).toContain("/^(INPUT|TEXTAREA|SELECT)$/");
  });
});
