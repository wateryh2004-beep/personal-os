import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Render the real materials view inside a minimal shell. Other workspaces are
// outside this fixture test and must not load sessions, accounts, or providers.
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("@/components/layout/app-shell", () => ({ AppShell: ({ presentationPathname, children }: { presentationPathname: string; children: React.ReactNode }) => createElement("div", { "data-pathname": presentationPathname }, children) }));
vi.mock("@/components/career/career-home-view", () => ({ CareerHomeView: () => null }));
vi.mock("@/components/today/now-workspace", () => ({ NowWorkspaceView: () => null }));
vi.mock("@/components/tasks/task-workspace", () => ({ TaskWorkspace: () => null }));
vi.mock("@/components/calendar/calendar-workspace", () => ({ CalendarWorkspace: () => null }));
vi.mock("@/components/notes/notes-workspace-shell", () => ({ NotesWorkspaceShell: () => null }));
vi.mock("@/components/notes/notes-workspace", () => ({ NotesWorkspace: () => null }));
vi.mock("@/components/tasks/tasks-workspace-skeleton", () => ({ TasksShell: () => null }));
vi.mock("@/components/calendar/calendar-workspace-skeleton", () => ({ CalendarShell: () => null }));
vi.mock("@/app/(app)/today/loading", () => ({ default: () => null }));
vi.mock("@/components/testing/files-polish-fixture", () => ({ FilesPolishFixture: () => null }));
vi.mock("@/components/testing/note-editor-polish-fixture", () => ({ NoteEditorPolishFixture: () => null }));
// Importing the fixture must not pull the authenticated query into the client graph.
vi.mock("@/features/career/materials", () => { throw new Error("A synthetic fixture must not import authenticated material queries at runtime"); });
import { WorkspacePolishHarness } from "@/components/testing/workspace-polish-harness";

describe("synthetic materials screenshot scene", () => {
  it("uses the real reader with varied synthetic states and the production materials shell path", () => {
    const html = renderToStaticMarkup(createElement(WorkspacePolishHarness, { scene: "career-materials" }));
    expect(html).toContain('data-pathname="/career/materials"');
    expect(html).toContain('data-testid="career-materials-view"');
    expect(html).toContain('data-testid="career-materials-fixture"');
    expect(html).toContain('data-testid="career-materials-unavailable"');
    expect(html).toContain("不包含个人资料或真实文件");
    expect(html).toContain("不供 AI 使用");
    expect(html).toContain("AI 敏感资料");
    expect(html).toContain("旧版存储附件");
    expect(html).toContain("这个版本尚无正文");
    expect(html).toContain("LongFileNameForNarrowScreenWrapping");
    expect(html).toContain("Synthetic résumé");
    expect(html.match(/data-testid="career-material-resume"/g)).toHaveLength(2);
    expect(html.match(/data-testid="career-material-document"/g)).toHaveLength(3);
    expect(html.match(/data-testid="career-material-read-link"/g)).toHaveLength(2);
    expect(html).not.toContain("/api/files/e2e-materials-legacy/download");
    expect(html).not.toContain("<form");
  });
  it("keeps the new scene inside the existing explicit E2E gate", () => {
    const route = readFileSync("src/app/mobile-native-e2e/page.tsx", "utf8");
    const gate = route.indexOf('process.env.E2E_MOBILE_HARNESS !== "1"');
    const scene = route.indexOf('"career-materials"');
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(scene).toBeGreaterThan(gate);
    expect(route.slice(gate, scene)).toContain("notFound()");
    expect(route).toContain("<WorkspacePolishHarness scene={scene as PolishScene}");
  });
});
