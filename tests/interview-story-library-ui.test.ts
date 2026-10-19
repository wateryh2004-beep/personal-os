// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useRouter: () => router, useSearchParams: () => {
    const raw = useSyncExternalStore(listener => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); }, () => window.location.search);
    return new URLSearchParams(raw);
  } };
});
import { StoryLibrary } from "@/components/career/interview/story-library";
let host: HTMLDivElement, root: Root;
const rows = [
  { id: "s1", title: "SQL 窗口函数", oneLine: "核对统计口径", status: "usable", experienceId: "e1", experienceLabel: "示例研究", competencies: [{ id: "c1", label: "分析" }], archetypeCount: 2 },
  { id: "s2", title: "沟通协作", oneLine: "确认验收标准", status: "draft", experienceId: null, experienceLabel: "", competencies: [], archetypeCount: 0 },
];
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/career/interview/stories");
  const replace = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => { replace(data, unused, url); window.dispatchEvent(new PopStateEvent("popstate")); });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(StoryLibrary, { rows, unavailable: false, createControl: null })));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function search(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
it("updates input, results and detail/return conditions together using Next-compatible native state", async () => {
  await search("SQL ");
  expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("SQL ");
  await search("SQL 窗口");
  expect(host.querySelector('[role="status"]')?.textContent).toContain("1 个结果");
  expect(host.querySelector('li a')?.getAttribute("href")).toContain("q=SQL+%E7%AA%97%E5%8F%A3");
  expect(window.history.replaceState).toHaveBeenLastCalledWith(null, "", expect.stringContaining("q="));
  const status = host.querySelector<HTMLSelectElement>('select[aria-label="使用状态"]')!;
  await act(async () => { status.value = "draft"; status.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.querySelector('[role="status"]')?.textContent).toContain("0 个结果");
  expect(host.textContent).toContain("没有匹配的故事");
  await act(async () => [...host.querySelectorAll("button")].find(item => item.textContent === "清除搜索与筛选")!.click());
  expect(host.querySelector('[role="status"]')?.textContent).toContain("2 个结果");
  expect(window.location.search).toBe("");
  await act(async () => { window.history.replaceState(null, "", "/career/interview/stories?competency=c1"); });
  expect(host.querySelector('[role="status"]')?.textContent).toContain("1 个结果");
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="关联能力"]')?.value).toBe("c1");
});

it("explicitly retries a failed server read without clearing the user's conditions", async () => {
  await search("SQL");
  await act(async () => root.render(createElement(StoryLibrary, { rows, unavailable: true, createControl: null })));
  const retry = [...host.querySelectorAll("button")].find(item => item.textContent === "重新读取故事库")!;
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("可能不完整");
  await act(async () => retry.click());
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("SQL");
  expect(window.location.search).toContain("q=SQL");
});
