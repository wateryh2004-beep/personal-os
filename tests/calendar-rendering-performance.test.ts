// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarEventRecord } from "@/features/calendar/types";

const captured = vi.hoisted(() => ({ events: [] as unknown[], plugins: [] as unknown[], dragRevertDuration: -1 }));
vi.mock("@fullcalendar/react", () => ({ default: (props: { events: unknown[]; plugins: unknown[]; dragRevertDuration: number }) => {
  captured.events = props.events;
  captured.plugins = props.plugins;
  captured.dragRevertDuration = props.dragRevertDuration;
  return null;
} }));
import { CalendarFullView } from "@/components/calendar/calendar-full-view";

afterEach(() => vi.restoreAllMocks());

describe("calendar rendering work", () => {
  it("settles drag reversal immediately for a live reduced-motion change and retains it after unrelated renders", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const descriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
    const listeners = new Set<() => void>();
    const preference = { matches: false, addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)), removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)) };
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => preference) });
    const container = document.createElement("div");
    const root = createRoot(container);
    const props: ComponentProps<typeof CalendarFullView> = { events: [], categories: [], timezone: "Asia/Shanghai", initialView: "timeGridDay", initialDate: new Date("2026-10-26T01:00:00Z"), loadingRange: false, onOpen: vi.fn(), onCreate: vi.fn(), onMove: vi.fn(), onRangeChange: vi.fn() };
    try {
      await act(async () => root.render(createElement(CalendarFullView, props)));
      expect(captured.dragRevertDuration).toBe(180);
      const source = captured.events;
      await act(async () => { preference.matches = true; listeners.forEach(notify => notify()); });
      expect(captured.dragRevertDuration).toBe(0);
      expect(captured.events).toBe(source);
      await act(async () => root.render(createElement(CalendarFullView, { ...props, loadingRange: true })));
      expect(captured.dragRevertDuration).toBe(0);
      expect(captured.events).toBe(source);
      await act(async () => { preference.matches = false; listeners.forEach(notify => notify()); });
      expect(captured.dragRevertDuration).toBe(180);
    } finally {
      await act(async () => root.unmount());
      expect(listeners.size).toBe(0);
      if (descriptor) Object.defineProperty(window, "matchMedia", descriptor);
      else Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("keeps event source identity through loading/panel renders and updates real event changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    const root = createRoot(container);
    const event: CalendarEventRecord = {
      id: "fixture", provider_event_id: "fixture", subject: "Fixture event", body_text: null,
      starts_at: "2026-08-08T06:10:00Z", ends_at: "2026-08-08T07:10:00Z", is_all_day: false,
      location_name: null, categories: [], importance: "normal", show_as: "busy", last_synced_at: "2026-08-08T00:00:00Z",
    };
    const props: ComponentProps<typeof CalendarFullView> = {
      events: [event], categories: [], timezone: "Asia/Shanghai", initialView: "timeGridWeek",
      initialDate: new Date(event.starts_at), loadingRange: false,
      onOpen: vi.fn(), onCreate: vi.fn(), onMove: vi.fn(), onRangeChange: vi.fn(),
    };
    try {
      await act(async () => root.render(createElement(CalendarFullView, props)));
      const initial = captured.events;
      const plugins = captured.plugins;
      for (let index = 0; index < 10; index += 1) {
        await act(async () => root.render(createElement(CalendarFullView, { ...props, loadingRange: index % 2 === 0, onOpen: vi.fn() })));
        expect(captured.events).toBe(initial);
        expect(captured.plugins).toBe(plugins);
      }
      await act(async () => root.render(createElement(CalendarFullView, { ...props, events: [{ ...event, subject: "Changed fixture" }] })));
      expect(captured.events).not.toBe(initial);
      expect(captured.events[0]).toMatchObject({ title: "Changed fixture" });
      const changed = captured.events;
      await act(async () => root.render(createElement(CalendarFullView, { ...props, timezone: "Asia/Tokyo" })));
      expect(captured.events).not.toBe(changed);
      expect((captured.events[0] as { start: Date }).start.getUTCHours()).toBe(15);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
