// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearWorkspaceResources, workspaceOwnerIsCurrent } from "@/lib/workspace-resource-cache";
import { pendingCalendarTasksSchema } from "@/features/workbench/operation-read-contracts";
import { pendingCalendarTasksResource } from "@/features/workbench/operation-read-resource";
import pendingTasks from "@/components/testing/planning-pending-tasks.json";

// Keep the real identity boundary, PendingTasks component, HTTP resource and
// strict response parser. Only unrelated page chrome / canvas are replaced.
vi.mock("@/components/layout/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => createElement("main", null, children) }));
vi.mock("@/components/calendar/calendar-full-view", () => ({ CalendarFullView: () => createElement("section", null, "Calendar canvas") }));
vi.mock("@/components/projects/projects-workspace", () => ({ ProjectsWorkspace: () => null }));
vi.mock("@fullcalendar/interaction", () => ({ Draggable: class { destroy() {} } }));
import { PlanningVisualFixture } from "@/components/testing/planning-visual-fixture";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearWorkspaceResources();
  sessionStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe("planning synthetic transport follows the real protected resource contract", () => {
  it("establishes a synthetic owner before its first actual GET and accepts the complete strict browser DTO", async () => {
    expect(pendingCalendarTasksSchema.parse(pendingTasks)).toEqual(pendingTasks);
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      expect(workspaceOwnerIsCurrent("synthetic-planning-owner")).toBe(true);
      expect(url).toBe("/api/calendar/pending-tasks");
      expect(options).toMatchObject({ cache: "no-store", credentials: "same-origin" });
      expect(options?.method ?? "GET").toBe("GET");
      return new Response(JSON.stringify(pendingTasks), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(PlanningVisualFixture, { mode: "calendar" })));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(pendingTasks.tasks[0].title);
    expect([...host.querySelectorAll("button")].find(button => button.textContent === "安排")?.disabled).toBe(false);
    expect(host.textContent).not.toContain("待安排任务暂时无法读取");
    expect(pendingCalendarTasksResource.get().data).toEqual(pendingTasks);
  });

  it("still rejects an HTTP 200 response missing status and keeps the truthful retry state", async () => {
    const { status: _status, ...incompleteTask } = pendingTasks.tasks[0];
    expect(_status).toBe("notStarted");
    const incomplete = { ...pendingTasks, tasks: [incompleteTask] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(incomplete), { headers: { "content-type": "application/json" } })));
    await act(async () => root.render(createElement(PlanningVisualFixture, { mode: "calendar" })));
    expect(host.textContent).toContain("待安排任务暂时无法读取");
    expect([...host.querySelectorAll("button")].find(button => button.textContent === "重试")).toBeDefined();
    expect([...host.querySelectorAll("button")].some(button => button.textContent === "安排")).toBe(false);
    expect(pendingCalendarTasksResource.get().data).toBeUndefined();
    expect(pendingCalendarTasksResource.get().error).toBeDefined();
  });
});
