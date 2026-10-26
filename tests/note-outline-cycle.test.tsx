// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NoteOutline } from "@/components/notes/note-outline";
import { parseMarkdownOutline } from "@/features/notes/editor/markdown-outline";

let host: HTMLDivElement; let root: Root;
const selected = vi.fn(() => true);
const changed = vi.fn();
const items = parseMarkdownOutline("# 第一章\n\n## 第二章\n\n## 第三章");
function Fixture() {
  const [open, setOpen] = useState(false);
  return <><button type="button" aria-label="外部打开" onClick={() => setOpen(true)}>打开</button><button type="button" aria-label="外部关闭" onClick={() => setOpen(false)}>关闭</button><NoteOutline open={open} onOpenChange={setOpen} disabled={false} items={items} listRef={() => {}} onSelect={selected} onListChange={changed} /></>;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // The fixture animation name is a plain identifier; jsdom lacks CSS.escape.
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const originalStyle = window.getComputedStyle.bind(window);
  vi.stubGlobal("getComputedStyle", (element: Element) => {
    const style = originalStyle(element);
    if (!element.classList.contains("note-outline-surface")) return style;
    // Exercise real Radix Presence's suspended exit, not an always-unmounted
    // mock. The same node remains connected until an animationend is delivered.
    return new Proxy(style, { get(target, name) {
      if (name === "animationName") return element.getAttribute("data-state") === "closed" ? "outline-presence" : "none";
      return Reflect.get(target, name, target);
    } });
  });
  selected.mockClear(); changed.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; vi.unstubAllGlobals();
});
const input = () => document.querySelector<HTMLInputElement>('[aria-label="筛选目录"]')!;
const panel = () => document.querySelector<HTMLElement>('[aria-label="笔记目录"]')!;
async function toggle() { await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="目录"]')!.click()); }
async function search(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("clears chapter filtering on a rapid reverse while retaining the same exiting Radix content", async () => {
  await act(async () => root.render(<Fixture />)); await toggle();
  const field = input(); const content = panel();
  await search("第二章"); expect(content.querySelectorAll("[data-outline-index]")).toHaveLength(1);
  await act(async () => content.querySelector<HTMLButtonElement>('[data-outline-index="1"]')!.click());
  expect(selected).toHaveBeenCalledWith(items[1]);
  expect(content.isConnected).toBe(true); expect(content.getAttribute("data-state")).toBe("closed");
  expect(content.getAttribute("aria-hidden")).toBe("true");
  expect(field.value).toBe("第二章"); expect(content.querySelectorAll("[data-outline-index]")).toHaveLength(1);
  await toggle();
  expect(panel()).toBe(content); expect(input()).toBe(field); expect(input().value).toBe("");
  expect(content.querySelectorAll("[data-outline-index]")).toHaveLength(3);
  expect(changed).toHaveBeenCalled();
});

it("also resets a controlled external close/open without relying on content unmount", async () => {
  await act(async () => root.render(<Fixture />)); await toggle();
  const content = panel(); await search("第三章");
  expect(content.querySelectorAll("[data-outline-index]")).toHaveLength(1);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="外部关闭"]')!.click());
  expect(content.isConnected).toBe(true);
  expect(input().value).toBe("第三章"); expect(content.querySelectorAll("[data-outline-index]")).toHaveLength(1);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="外部打开"]')!.click());
  expect(panel()).toBe(content); expect(input().value).toBe("");
  expect(content.querySelectorAll("[data-outline-index]")).toHaveLength(3);
});

it("does not carry a jumped opening's focus veto into an external rapid reopen", async () => {
  await act(async () => root.render(<Fixture />)); await toggle();
  await search("第二章"); const content = panel();
  await act(async () => content.querySelector<HTMLButtonElement>('[data-outline-index="1"]')!.click());
  expect(content.isConnected).toBe(true); expect(input().value).toBe("第二章");
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="外部打开"]')!.click());
  expect(panel()).toBe(content); expect(input().value).toBe("");
  await act(async () => { input().focus(); input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
  expect(content.getAttribute("data-state")).toBe("closed");
  await act(async () => {
    const end = new Event("animationend", { bubbles: true }); Object.defineProperty(end, "animationName", { value: "outline-presence" });
    content.dispatchEvent(end);
  });
  // Radix FocusScope defers its unmount autofocus to the next task.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(document.activeElement).toBe(host.querySelector('[aria-label="目录"]'));
});
