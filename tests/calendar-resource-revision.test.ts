// @vitest-environment jsdom
import { act, createElement, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEventRecord } from "@/features/calendar/types";
import type { CalendarFullView } from "@/components/calendar/calendar-full-view";

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn(), refresh: vi.fn() },
  move: vi.fn(), fullView: null as ComponentProps<typeof CalendarFullView> | null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, usePathname: () => "/calendar" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/features/calendar/actions", () => ({ updateCalendarEvent: mocks.move, syncAndBackupMicrosoftAction: vi.fn() }));
vi.mock("@/components/shared/inspector", () => ({ Inspector: ({ open, children }: { open: boolean; children: ReactNode }) => open ? createElement("aside", null, children) : null }));
vi.mock("@/components/links/entity-backlinks", () => ({ EntityBacklinks: () => null }));
vi.mock("@/components/ai/ai-sidecar", () => ({ AISidecar: () => null }));
vi.mock("@/components/calendar/calendar-category-manager", () => ({ CalendarCategoryManager: () => null }));
vi.mock("@/components/calendar/calendar-create-form", () => ({ CalendarCreateForm: ({ initialStart }: { initialStart: string }) => createElement("input", { "data-create": initialStart, defaultValue: "New event" }) }));
vi.mock("@/components/calendar/calendar-event-edit-form", () => ({ CalendarEventEditForm: ({ event }: { event: CalendarEventRecord }) => createElement("div", { "data-selected": event.id }, createElement("span", null, event.subject), createElement("input", { defaultValue: event.subject }), createElement("input", { type: "hidden", name: "original_subject", value: event.subject }), createElement("input", { type: "hidden", name: "original_starts_at", value: event.starts_at }), createElement("input", { type: "hidden", name: "original_ends_at", value: event.ends_at })) }));
vi.mock("@/components/calendar/calendar-full-view", () => ({ CalendarFullView: (props: ComponentProps<typeof CalendarFullView>) => {
  mocks.fullView = props;
  return createElement("main", null, props.events.map((event) => createElement("button", { key: event.id, onClick: () => props.onOpen(event) }, event.subject)));
} }));

import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { WorkspacePanelProvider } from "@/components/layout/workspace-panel-provider";
import { calendarRangeResource } from "@/features/calendar/workspace-resource";
import { calendarRangeKey } from "@/features/calendar/client-state";
import { clearWorkspaceResources, reconcileWorkspaceScope, WorkspaceAuthenticationError } from "@/lib/workspace-resource-cache";

const range = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-10-08T00:00:00Z") };
const otherRange = { start: new Date("2026-10-08T00:00:00Z"), end: new Date("2026-10-15T00:00:00Z") };
function resourceFor(value = range) {
  const start = value.start.toISOString(), end = value.end.toISOString();
  return calendarRangeResource(`calendar:range:${calendarRangeKey(start, end)}`, start, end);
}
function event(id: string, patch: Partial<CalendarEventRecord> = {}): CalendarEventRecord {
  return { id, provider_event_id: id, subject: `Event ${id}`, body_text: null, starts_at: "2026-10-02T09:00:00Z", ends_at: "2026-10-02T10:00:00Z", is_all_day: false, location_name: null, categories: [], importance: "normal", show_as: "busy", last_synced_at: "2026-10-01T00:00:00Z", ...patch };
}
function response(events: CalendarEventRecord[], truncated = false) {
  return { ok: true, status: 200, json: async () => ({ events, truncated }) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let root: Root, container: HTMLDivElement;
let owner = 0;
let fetcher: ReturnType<typeof vi.fn>;
async function render() {
  await act(async () => {
    root.render(createElement(WorkspacePanelProvider, null, createElement(CalendarWorkspace, { events: [], categories: [], timezone: "UTC", syncStatus: null, scopeReady: true })));
  });
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });
}
async function activate(value = range) { await act(async () => { mocks.fullView!.onRangeChange(value); }); }
async function revision(value: string) { await act(async () => { reconcileWorkspaceScope(`calendar-owner-${owner}`, value); }); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  clearWorkspaceResources();
  owner += 1;
  reconcileWorkspaceScope(`calendar-owner-${owner}`, "initial");
  sessionStorage.clear();
  window.history.replaceState(null, "", "/calendar");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  fetcher = vi.fn().mockResolvedValue(response([]));
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  clearWorkspaceResources();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("Calendar active range resources", () => {
  it("refreshes an active range for each server revision while retaining the selected editor, unsaved input, and original mutation baseline", async () => {
    resourceFor().set({ events: [event("a")], truncated: false });
    resourceFor(otherRange).set({ events: [event("inactive")], truncated: false });
    await render(); await activate();
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => { mocks.fullView!.onOpen(event("a")); });
    const editor = container.querySelector<HTMLInputElement>("aside input")!;
    editor.value = "Unsaved edit";
    for (const source of ["global", "assistant", "category"]) {
      fetcher.mockResolvedValueOnce(response([event("a", { subject: `${source} update`, starts_at: "2026-10-02T11:00:00Z", ends_at: "2026-10-02T12:00:00Z" })]));
      await revision(source);
      expect(mocks.fullView!.events[0].subject).toBe(`${source} update`);
      expect(container.querySelector("aside input")).toBe(editor);
      expect(editor.value).toBe("Unsaved edit");
      expect(container.querySelector('[data-selected="a"]')?.textContent).toContain("Event a");
      expect(container.querySelector<HTMLInputElement>('[name="original_subject"]')?.value).toBe("Event a");
      expect(container.querySelector<HTMLInputElement>('[name="original_starts_at"]')?.value).toBe(event("a").starts_at);
      expect(container.querySelector<HTMLInputElement>('[name="original_ends_at"]')?.value).toBe(event("a").ends_at);
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(resourceFor(otherRange).get().staleAt).toBe(0);
  });

  it.each(["expired", "invalidated"])("shows a %s cached range immediately and reconciles it in the background", async (reason) => {
    const resource = resourceFor();
    resource.set({ events: [event("cached")], truncated: false });
    if (reason === "expired") vi.setSystemTime(Date.now() + 120_001);
    else resource.invalidate();
    const pending = deferred<ReturnType<typeof response>>();
    fetcher.mockReturnValueOnce(pending.promise);
    await render(); await activate();
    expect(mocks.fullView!.events[0].id).toBe("cached");
    expect(mocks.fullView!.loadingRange).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(response([event("fresh")])); await pending.promise; });
    expect(mocks.fullView!.events[0].id).toBe("fresh");
    expect(mocks.fullView!.loadingRange).toBe(false);
  });

  it("retains a new-event draft while server records reconcile", async () => {
    resourceFor().set({ events: [event("a")], truncated: false });
    await render(); await activate();
    await act(async () => { mocks.fullView!.onCreate({ startsAt: "2026-10-02T13:00:00Z", endsAt: "2026-10-02T14:00:00Z", isAllDay: false }); });
    const editor = container.querySelector<HTMLInputElement>("aside input")!;
    editor.value = "Unsaved new event";
    fetcher.mockResolvedValueOnce(response([event("new")]));
    await revision("create-open");
    expect(mocks.fullView!.events[0].id).toBe("new");
    expect(container.querySelector("aside input")).toBe(editor);
    expect(editor.value).toBe("Unsaved new event");
  });

  it("ignores an aborted pre-revision response without clearing the replacement request's spinner", async () => {
    const old = deferred<ReturnType<typeof response>>(), fresh = deferred<ReturnType<typeof response>>();
    fetcher.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    await render(); await activate();
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    await revision("newer");
    expect(signal.aborted).toBe(true);
    await act(async () => { old.resolve(response([event("obsolete")], true)); await old.promise; });
    expect(mocks.fullView!.loadingRange).toBe(true);
    expect(mocks.fullView!.events).toEqual([]);
    expect(container.textContent).not.toContain("无法读取");
    await act(async () => { fresh.resolve(response([event("current")])); await fresh.promise; });
    expect(mocks.fullView!.events[0].id).toBe("current");
    expect(mocks.fullView!.loadingRange).toBe(false);
  });

  it("unsubscribes an old range and the unmounted workspace from revision refreshes", async () => {
    const old = deferred<ReturnType<typeof response>>();
    fetcher.mockReturnValueOnce(old.promise);
    resourceFor(otherRange).set({ events: [event("b")], truncated: false });
    await render(); await activate(); await activate(otherRange);
    expect(mocks.fullView!.events[0].id).toBe("b");
    await act(async () => { old.resolve(response([event("obsolete")])); await old.promise; });
    expect(mocks.fullView!.events[0].id).toBe("b");
    fetcher.mockResolvedValueOnce(response([event("new-b")]));
    await revision("range-switched");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(mocks.fullView!.events[0].id).toBe("new-b");
    await act(async () => { root.render(null); });
    await revision("unmounted");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("preserves a pending drag overlay while unrelated rows refresh, then reconciles the saved range", async () => {
    const a = event("a"), b = event("b");
    resourceFor().set({ events: [a, b], truncated: false });
    const save = deferred<{ status: string; message: string }>();
    mocks.move.mockReturnValueOnce(save.promise);
    await render(); await activate();
    let moving!: Promise<void>;
    const move = { startsAt: "2026-10-02T13:00:00Z", endsAt: "2026-10-02T14:00:00Z", isAllDay: false };
    await act(async () => { moving = mocks.fullView!.onMove(a, move); });
    fetcher.mockResolvedValueOnce(response([a, event("b", { subject: "Fresh unrelated row" })]));
    await revision("during-drag");
    expect(mocks.fullView!.events.find((item) => item.id === "a")?.starts_at).toBe(move.startsAt);
    expect(mocks.fullView!.events.find((item) => item.id === "b")?.subject).toBe("Fresh unrelated row");
    fetcher.mockResolvedValueOnce(response([event("a", { starts_at: move.startsAt, ends_at: move.endsAt }), b]));
    await act(async () => { save.resolve({ status: "success", message: "Saved" }); await moving; });
    expect(mocks.fullView!.events.find((item) => item.id === "a")?.starts_at).toBe(move.startsAt);
  });

  it("rolls back a failed drag to the newest server baseline without losing unrelated updates", async () => {
    const a = event("a");
    resourceFor().set({ events: [a], truncated: false });
    const save = deferred<{ status: string; message: string }>();
    mocks.move.mockReturnValueOnce(save.promise);
    await render(); await activate();
    let moving!: Promise<void>;
    await act(async () => { moving = mocks.fullView!.onMove(a, { startsAt: "2026-10-02T13:00:00Z", endsAt: "2026-10-02T14:00:00Z", isAllDay: false }); });
    fetcher.mockResolvedValueOnce(response([event("a", { subject: "Updated title", starts_at: "2026-10-02T11:00:00Z" }), event("new")]));
    await revision("drag-baseline");
    expect(mocks.fullView!.events[0].starts_at).toBe("2026-10-02T13:00:00Z");
    await act(async () => { save.resolve({ status: "error", message: "Not saved" }); await expect(moving).rejects.toThrow("Not saved"); });
    expect(mocks.fullView!.events[0]).toMatchObject({ subject: "Updated title", starts_at: "2026-10-02T11:00:00Z" });
    expect(mocks.fullView!.events[1].id).toBe("new");
    expect(container.textContent).toContain("Not saved");
  });

  it.each([401, 403])("treats range HTTP %s as authentication failure and clears cached ranges", async (status) => {
    resourceFor(otherRange).set({ events: [event("private")], truncated: false });
    const json = vi.fn();
    fetcher.mockResolvedValueOnce({ ok: false, status, json });
    await expect(resourceFor().revalidate()).rejects.toBeInstanceOf(WorkspaceAuthenticationError);
    expect(json).not.toHaveBeenCalled();
    expect(resourceFor(otherRange).get().data).toBeUndefined();
  });
});
