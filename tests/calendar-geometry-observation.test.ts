// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeCalendarGeometry } from "@/components/calendar/observe-calendar-geometry";

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe("calendar geometry observation", () => {
  it("remeasures actual text or pane changes once per frame, skips feedback, and cancels after disposal", () => {
    let notify!: () => void;
    const observe = vi.fn(), unobserve = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { notify = callback; } observe = observe; unobserve = unobserve; disconnect = disconnect; });
    const frames = new Map<number, FrameRequestCallback>(); let sequence = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); };
    const root = document.createElement("div"), label = document.createElement("span"); label.className = "fc-timegrid-slot-label-cushion"; label.textContent = "09:00"; root.append(label); document.body.append(root);
    let width = 360, height = 600, glyphWidth = 35, glyphHeight = 18;
    Object.defineProperties(root, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
    Object.defineProperties(label, { offsetWidth: { get: () => glyphWidth }, offsetHeight: { get: () => glyphHeight } });
    const update = vi.fn(); const dispose = observeCalendarGeometry(root, update);
    notify(); notify(); expect(frames.size).toBe(1); flush(); expect(update).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(label);
    // FullCalendar may notify the observer after updating its own layout.
    notify(); flush(); expect(update).toHaveBeenCalledTimes(1);
    glyphWidth *= 2; glyphHeight *= 2; notify(); notify(); flush(); expect(update).toHaveBeenCalledTimes(2);
    width = 480; notify(); flush(); expect(update).toHaveBeenCalledTimes(3);
    height = 0; notify(); flush(); expect(update).toHaveBeenCalledTimes(3);
    height = 600; notify(); flush(); expect(update).toHaveBeenCalledTimes(4);
    width = 600; notify(); expect(frames.size).toBe(1); dispose(); flush();
    expect(update).toHaveBeenCalledTimes(4); expect(disconnect).toHaveBeenCalledTimes(1);
    notify(); expect(frames.size).toBe(0);
  });
});
