// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const nativeStyle = window.getComputedStyle.bind(window);
  // jsdom has no stylesheet animation engine. Keep Radix's real Presence and
  // model the live closed-state animation name; CI verifies its actual lifetime.
  vi.stubGlobal("getComputedStyle", (node: Element) => {
    const style = nativeStyle(node);
    return new Proxy(style, { get(target, property) {
      if (property === "animationName" && node.getAttribute("data-slot") === "popover-content") return node.getAttribute("data-state") === "closed" ? "synthetic-popover-exit" : "none";
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  });
  vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (value: string) => value });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("makes retained uncontrolled content inert and hidden after close, then reopens the same content", async () => {
  const changed = vi.fn();
  await act(async () => root.render(<Popover defaultOpen onOpenChange={changed}><PopoverTrigger asChild><button>切换浮层</button></PopoverTrigger><PopoverContent><button>内部操作</button></PopoverContent></Popover>));
  const trigger = host.querySelector<HTMLButtonElement>('button')!;
  const layer = document.querySelector<HTMLElement>('[data-slot="popover-content"]')!;
  expect(layer.dataset.state).toBe('open'); expect(layer.hasAttribute('inert')).toBe(false);
  await act(async () => trigger.click());
  expect(changed).toHaveBeenLastCalledWith(false);
  expect(layer.isConnected).toBe(true); expect(layer.dataset.state).toBe('closed');
  expect(layer.hasAttribute('inert')).toBe(true); expect(layer.getAttribute('aria-hidden')).toBe('true');
  await act(async () => trigger.click());
  expect(changed).toHaveBeenLastCalledWith(true);
  expect(document.querySelector('[data-slot="popover-content"]')).toBe(layer);
  expect(layer.dataset.state).toBe('open'); expect(layer.hasAttribute('inert')).toBe(false); expect(layer.hasAttribute('aria-hidden')).toBe(false);
  await act(async () => trigger.click());
  const ended = new Event("animationend", { bubbles: true });
  Object.defineProperty(ended, "animationName", { value: "synthetic-popover-exit" });
  await act(async () => layer.dispatchEvent(ended));
  expect(layer.isConnected).toBe(false);
});
function Controlled() {
  const [open, setOpen] = useState(true);
  return <><button onClick={() => setOpen(value => !value)}>外部切换</button><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button>受控浮层</button></PopoverTrigger><PopoverContent inert={false} aria-hidden={false}><button>受控内部操作</button></PopoverContent></Popover></>;
}
it("honors controlled close without letting caller attributes expose the exiting layer", async () => {
  await act(async () => root.render(<Controlled/>));
  const layer = document.querySelector<HTMLElement>('[data-slot="popover-content"]')!;
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(layer.dataset.state).toBe('closed'); expect(layer.hasAttribute('inert')).toBe(true); expect(layer.getAttribute('aria-hidden')).toBe('true');
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(layer.dataset.state).toBe('open'); expect(layer.hasAttribute('inert')).toBe(false); expect(layer.getAttribute('aria-hidden')).toBe('false');
});
