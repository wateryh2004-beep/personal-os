// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";

const mocks = vi.hoisted(() => ({ createProject: vi.fn(),readProject:vi.fn(), canonicalHref: "" }));
vi.mock("@/features/projects/creation-intents",()=>({submitProjectCreationIntent:mocks.createProject,readProjectCreationIntent:mocks.readProject}));
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
// Subscribe to Next's canonical URL, including its internal-history bypass.
// Re-rendering with manually changed query fixtures would miss stale create=1.
vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (notify: () => void) => {
    const onPopState = () => { mocks.canonicalHref = window.location.href; notify(); };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("test:next-history", notify);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("test:next-history", notify);
    };
  };
  return {
    useSearchParams: () => {
      const href = useSyncExternalStore(subscribe, () => mocks.canonicalHref, () => "http://localhost:3000/projects");
      return useMemo(() => new URL(href).searchParams, [href]);
    },
    unstable_rethrow: vi.fn(),
  };
});

let host: HTMLDivElement;
let root: Root;
const routeState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["projects"] };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  vi.clearAllMocks();clearWorkspaceResources();
  window.history.replaceState(routeState, "", "/projects");
  mocks.canonicalHref = window.location.href;
  for (const method of ["replaceState", "pushState"] as const) {
    const original = window.history[method].bind(window.history);
    vi.spyOn(window.history, method).mockImplementation((...args) => {
      const [data, unused, url] = args;
      if (data?.__NA || data?._N) return original(...args);
      original({ ...data, __NA: window.history.state?.__NA, __PRIVATE_NEXTJS_INTERNALS_TREE: window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE }, unused, url);
      if (url) {
        mocks.canonicalHref = window.location.href;
        window.dispatchEvent(new Event("test:next-history"));
      }
    });
  }
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();clearWorkspaceResources();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function render(initialCreateOpen = false) {
  await act(async () => root.render(createElement(ProjectsWorkspace, { projects: [], initialCreateOpen })));
}
async function click(label: string) { await act(async () => button(label).click()); }
async function submit(form: HTMLFormElement) {
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
async function flushBack() {
  await act(async () => {
    window.history.back();
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
  });
}

describe("project creation lifecycle", () => {
  it("guards duplicate writes and dismissal, preserves a failed draft, then closes and resets on success", async () => {
    let reject!: (reason: Error) => void;
    mocks.createProject.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    await render();
    await click("新建项目");
    const form = document.querySelector<HTMLFormElement>("form")!;
    const name = form.querySelector<HTMLInputElement>('[name="name"]')!;
    const description = form.querySelector<HTMLTextAreaElement>('[name="description"]')!;
    const dueDate = form.querySelector<HTMLInputElement>('[name="due_date"]')!;
    name.value = "主线项目"; description.value = "保留这段说明"; dueDate.value = "2026-10-20";
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(mocks.createProject.mock.calls[0][1]).toEqual({ name: "主线项目", description: "保留这段说明", due_date: "2026-10-20" });
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(form.querySelector("fieldset")?.disabled).toBe(false);expect(name.matches(":disabled")).toBe(false);
    await click("关闭");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => reject(new Error("网络暂不可用，请重试")));
    expect(document.body.textContent).toContain("保存结果尚未确认");
    expect([name.value, description.value, dueDate.value]).toEqual(["主线项目", "保留这段说明", "2026-10-20"]);
    expect(form.querySelector("fieldset")?.disabled).toBe(false);
    mocks.readProject.mockResolvedValue({status:"saved",id:"11111111-1111-4111-8111-111111111111"});
    await submit(form);
    expect(mocks.createProject).toHaveBeenCalledTimes(1);expect(mocks.readProject).toHaveBeenCalledOnce();expect(mocks.readProject.mock.calls[0]).toEqual(mocks.createProject.mock.calls[0]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toBe("项目已创建");
    await click("新建项目");
    expect(document.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe("");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it("keeps a deferred draft without writing and restores its raw form", async () => {
    await render();
    await click("新建项目");
    const rawName="  不要自动创建  ",rawDescription="原始说明\n\n  继续输入  ";
    await act(async()=>{
      const name=document.querySelector<HTMLInputElement>('[name="name"]')!,description=document.querySelector<HTMLTextAreaElement>('[name="description"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(name,rawName);name.dispatchEvent(new Event("input",{bubbles:true}));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(description,rawDescription);description.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await click("稍后继续");
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click("新建项目");
    expect(document.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe(rawName);
    expect(document.querySelector<HTMLTextAreaElement>('[name="description"]')?.value).toBe(rawDescription);
    expect(mocks.createProject).not.toHaveBeenCalled();
    mocks.createProject.mockResolvedValue({status:"saved",id:"11111111-1111-4111-8111-111111111111"});
    await submit(document.querySelector<HTMLFormElement>("form")!);
    expect(mocks.createProject).toHaveBeenCalledOnce();
    expect(mocks.createProject.mock.calls[0][1]).toMatchObject({name:rawName,description:rawDescription});
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("consumes create intent before mobile history and supports another same-route request", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true })) });
    window.history.replaceState(null, "", "/projects?create=1&filter=active#list");
    const push = vi.spyOn(window.history, "pushState");
    await render(true);
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/projects?filter=active#list");
    expect(push).toHaveBeenCalledTimes(1);
    expect(String(push.mock.calls[0][2])).not.toContain("create=");
    expect(window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(["projects"]);
    expect(mocks.canonicalHref).toBe(window.location.href);
    await flushBack();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(window.history.state).toEqual(routeState);
    expect(window.location.search).toBe("?filter=active");
    await render(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => window.history.pushState(null, "", "/projects?filter=active&create=1#list"));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await flushBack();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/projects?filter=active#list");
  });

  it("clears Next's canonical create URL so repeated desktop requests reopen without a remount", async () => {
    window.history.replaceState(null, "", "/projects?create=1&filter=active#list");
    await render(true);
    expect(mocks.canonicalHref).toBe(window.location.href);
    await click("稍后继续");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => window.history.pushState(null, "", "/projects?create=1&filter=active#list"));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/projects?filter=active#list");
    expect(mocks.canonicalHref).toBe(window.location.href);
  });

  it("vetoes mobile Back while a write is pending and restores one usable dismissal step", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true })) });
    let reject!: (reason: Error) => void;
    mocks.createProject.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    await render(); await click("新建项目");
    const form = document.querySelector<HTMLFormElement>("form")!;
    form.querySelector<HTMLInputElement>('[name="name"]')!.value = "保留项目";
    await submit(form);
    const pendingHistory = window.history.state;
    await flushBack();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(window.history.state).toEqual(pendingHistory);
    await act(async () => reject(new Error("稍后重试")));
    await flushBack();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(window.history.state).toEqual(routeState);
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
  });
});
