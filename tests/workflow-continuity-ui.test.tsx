// @vitest-environment jsdom
import { act, createElement, type MouseEvent as ReactMouseEvent, type AnchorHTMLAttributes } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkbenchContext, type WorkbenchContextValue } from "@/components/workbench/workbench-context";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
vi.mock("next/link", () => ({ default: ({ onNavigate, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: (event: { preventDefault(): void }) => void }) => createElement("a", { ...props, onClick: (event: ReactMouseEvent<HTMLAnchorElement>) => { onClick?.(event); if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) onNavigate?.({ preventDefault: () => event.preventDefault() }); event.preventDefault(); } }) }));
import { SourceLink, SourceNavigationContext } from "@/components/workflow-continuity/source-link";

let host: HTMLDivElement; let root: ReturnType<typeof createRoot>;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); clearWorkspaceResources(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.useRealTimers(); });
function pointer(target: EventTarget, type: string, values: Record<string, unknown> = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { button: 0, isPrimary: true, pointerType: "touch", pointerId: 1, clientX: 20, clientY: 20 }, values); target.dispatchEvent(event);
}
const entity = { kind: "shopping" as const, id: "00000000-0000-4000-8000-000000000001" };
describe("long press selection", () => {
  async function mount(toggle: () => void, click: () => void) {
    const context: WorkbenchContextValue = { register: () => () => {}, openPreview: vi.fn(), openReference: vi.fn(), compare: vi.fn(), toggleSelection: toggle, isSelected: () => false, selected: [], clearSelection: vi.fn() };
    await act(async () => root.render(<WorkbenchContext.Provider value={context}><WorkbenchRecord entity={entity} title="合成物品" group="items"><span data-test-blank onClick={click}>行空白</span></WorkbenchRecord></WorkbenchContext.Provider>));
    return host.querySelector<HTMLElement>("[data-test-blank]")!;
  }
  it("selects after holding row whitespace and swallows only that gesture's synthetic click", async () => {
    vi.useFakeTimers(); const toggle = vi.fn(); const click = vi.fn(); const blank = await mount(toggle, click);
    await act(async () => { pointer(blank, "pointerdown"); vi.advanceTimersByTime(450); pointer(blank, "pointerup"); blank.click(); });
    expect(toggle).toHaveBeenCalledTimes(1); expect(click).not.toHaveBeenCalled();
    await act(async () => { pointer(blank, "pointerdown"); pointer(blank, "pointerup"); blank.click(); });
    expect(click).toHaveBeenCalledTimes(1); // The next real tap is never eaten by a time window.
  });
  it("leaves a new tap intact when the OS swallowed the held gesture click", async () => {
    vi.useFakeTimers(); const toggle = vi.fn(); const click = vi.fn(); const blank = await mount(toggle, click);
    await act(async () => { pointer(blank, "pointerdown"); vi.advanceTimersByTime(450); pointer(blank, "pointerup"); });
    await act(async () => { pointer(blank, "pointerdown"); pointer(blank, "pointerup"); blank.click(); });
    expect(toggle).toHaveBeenCalledTimes(1); expect(click).toHaveBeenCalledTimes(1);
  });
  it("cancels on movement, scroll, pointer cancellation, scope change and controls", async () => {
    vi.useFakeTimers(); const toggle = vi.fn(); const blank = await mount(toggle, vi.fn());
    for (const cancel of [() => pointer(window, "pointermove", { clientX: 29 }), () => window.dispatchEvent(new Event("scroll")), () => pointer(window, "pointercancel"), () => clearWorkspaceResources()]) {
      await act(async () => { pointer(blank, "pointerdown"); vi.advanceTimersByTime(200); cancel(); vi.advanceTimersByTime(500); });
    }
    const checkbox = host.querySelector("input")!;
    await act(async () => { pointer(checkbox, "pointerdown"); vi.advanceTimersByTime(500); pointer(checkbox, "pointerup"); });
    expect(toggle).not.toHaveBeenCalled();
    await act(async () => host.querySelector("[data-workbench-record]")!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", shiftKey: true, bubbles: true, cancelable: true })));
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});

describe("explicit source links", () => {
  it("preserves the original handler's cancellation and modifier clicks", async () => {
    const navigate = vi.fn(() => true); const original = vi.fn();
    await act(async () => root.render(createElement(SourceNavigationContext.Provider, { value: navigate }, createElement(SourceLink, { href: "/files?file=00000000-0000-4000-8000-000000000001", onClick: original }, "资料"))));
    const anchor = host.querySelector("a")!;
    await act(async () => anchor.dispatchEvent(new MouseEvent("click", { button: 0, ctrlKey: true, bubbles: true, cancelable: true })));
    expect(original).toHaveBeenCalledTimes(1); expect(navigate).not.toHaveBeenCalled();
    await act(async () => anchor.click()); expect(navigate).toHaveBeenCalledTimes(1);
    await act(async () => root.render(createElement(SourceNavigationContext.Provider, { value: navigate }, createElement(SourceLink, { href: "/files", onNavigate: event => event.preventDefault() }, "资料"))));
    await act(async () => host.querySelector("a")!.click()); expect(navigate).toHaveBeenCalledTimes(1);
  });
  it("keeps ordinary navigation when a domain is rendered without the shell", async () => {
    await act(async () => root.render(createElement(SourceLink, { href: "#synthetic" }, "普通链接")));
    expect(host.querySelector("a")?.getAttribute("href")).toBe("#synthetic");
  });
});
