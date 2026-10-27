// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectProgress, type ProjectPresentation } from "@/components/projects/project-progress";
import { NowHeader } from "@/components/today/now-header";
import { calendarDragPreview, calendarDurationLabel } from "@/components/calendar/calendar-drag-preview";
import type { CalendarEventRecord } from "@/features/calendar/types";
import type { NowWorkspace } from "@/features/today/types";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const project: ProjectPresentation = { id: "fixture", name: "清楚的项目目标", description: "保留真实依据\n明确完成标准", status: "active", due_date: "2026-11-08", updated_at: "2026-10-26T01:00:00Z" };
const event = (id: string, start: string, end: string, show_as: CalendarEventRecord["show_as"] = "busy"): CalendarEventRecord => ({ id, provider_event_id: id, subject: id, body_text: null, starts_at: start, ends_at: end, is_all_day: false, location_name: null, categories: [], importance: "normal", show_as, last_synced_at: start });

describe("planning visual behavior preserves factual boundaries", () => {
  it("keeps expanded project details mounted and reverses without losing their content", async () => {
    await act(async () => root.render(createElement(ProjectProgress, { project })));
    const button = host.querySelector<HTMLButtonElement>("h2 button")!;
    const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(panel.getAttribute("aria-hidden")).toBe("false");
    expect(panel.textContent).toContain(project.description);
    const goal = panel.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(goal.labels?.length).toBe(1);
    expect(goal.labels?.[0]?.textContent).toBe("项目目标");
    expect(goal.labels?.[0]?.htmlFor).toBe(goal.id);
    expect(goal.value).toBe(project.description);
    await act(async () => { button.click(); button.click(); });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(panel.id)).toBe(panel);
    await act(async () => root.render(createElement(ProjectProgress, { project: { ...project, status: "completed" } })));
    expect(host.querySelector('[aria-label="项目状态：已完成"] [data-complete=true]')).not.toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(host.textContent).not.toMatch(/%|里程碑|下一任务/);
  });

  it("represents paused or unknown status separately and does not pretend completion", async () => {
    await act(async () => root.render(createElement(ProjectProgress, { project: { ...project, status: "on_hold", description: null, due_date: null } })));
    expect(host.querySelector('[aria-label="项目状态：已暂停"]')).not.toBeNull();
    expect(host.querySelector('[data-complete=true]')).toBeNull();
    expect(host.textContent).toContain("未设目标日");
    await act(async () => root.render(createElement(ProjectProgress, { project: { ...project, status: "future_status" } })));
    expect(host.querySelector('[aria-label="项目状态：其他状态"]')).not.toBeNull();
    expect(host.querySelector('[data-current=true]')).toBeNull();
  });

  it("uses the same snapshot's owner date for the decorative date and accessible heading", () => {
    const html = renderToStaticMarkup(createElement(NowHeader, { workspace: { generatedAt: "2026-10-25T18:00:00Z", timezone: "Asia/Shanghai" } as NowWorkspace }));
    expect(html).toContain('today-calendar-day">26<');
    expect(html).toContain("星期一");
    expect(html).toContain("10月26日");
    const unknown = renderToStaticMarkup(createElement(NowHeader, { workspace: { generatedAt: "invalid", timezone: "Asia/Shanghai" } as NowWorkspace }));
    expect(unknown).toContain("今日概览");
    expect(unknown).not.toContain("today-calendar-day");
  });

  it("reports actual bounded overlaps, excludes itself/free events and respects exclusive ends", () => {
    const range = { startsAt: "2026-10-26T02:00:00Z", endsAt: "2026-10-26T02:45:00Z", eventId: "self" };
    const records = [event("self", range.startsAt, range.endsAt), event("before", "2026-10-26T01:00:00Z", range.startsAt), event("after", range.endsAt, "2026-10-26T03:00:00Z"), event("busy", "2026-10-26T02:30:00Z", "2026-10-26T03:00:00Z"), event("free", range.startsAt, range.endsAt, "free")];
    const preview = calendarDragPreview(records, range);
    expect(preview.durationMinutes).toBe(45);
    expect(preview.overlaps.map(value => value.id)).toEqual(["busy"]);
    expect(calendarDurationLabel(preview.durationMinutes)).toBe("45 分钟");
    expect(calendarDurationLabel(90)).toBe("1 小时 30 分钟");
    expect(calendarDurationLabel(120)).toBe("2 小时");
    expect(calendarDragPreview(records, { startsAt: "invalid", endsAt: range.endsAt })).toEqual({ durationMinutes: null, overlaps: [] });
    expect(calendarDragPreview(records, { startsAt: range.endsAt, endsAt: range.startsAt })).toEqual({ durationMinutes: null, overlaps: [] });
  });
});
