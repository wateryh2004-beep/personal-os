// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useRouter: () => router, useSearchParams: () => new URLSearchParams(useSyncExternalStore(listener => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); }, () => window.location.search)) };
});
import { ExperienceLibrary } from "@/components/career/experience-library";
import type { ExperienceRow } from "@/features/career/experience-library";
let host: HTMLDivElement, root: Root;
const base: ExperienceRow = { id: "e1", organization: "示例SQL团队", role: "分析", department: "数据", location: "北京", experience_type: "internship", status: "confirmed", confidentiality_level: "private", is_current: true, start_date: null, end_date: null };
const rows = [base, { ...base, id: "e2", experience_type: "education" as const, is_current: false, status: "draft" as const }];
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); window.history.replaceState(null, "", "/career/experiences");
  const replace = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => { replace(data, unused, url); window.dispatchEvent(new PopStateEvent("popstate")); });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(ExperienceLibrary, { rows, unavailable: false })));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function search(value: string) { const input = host.querySelector("input")!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
it("synchronizes entered spaces, compound filters, detail links and history restoration", async () => {
  await search("SQL "); expect(host.querySelector("input")?.value).toBe("SQL ");
  await search("SQL 北京");
  const period = host.querySelector<HTMLSelectElement>('[aria-label="进行情况"]')!;
  await act(async () => { period.value = "current"; period.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.querySelector('[role="status"]')?.textContent).toContain("1 个结果"); expect(host.querySelector("li a")?.getAttribute("href")).toContain("period=current");
  expect(window.history.replaceState).toHaveBeenLastCalledWith(null, "", expect.stringContaining("q=SQL+"));
  await act(async () => window.history.replaceState(null, "", "/career/experiences?type=__proto__&period=constructor&status=__proto__"));
  expect(period.value).toBe("constructor"); expect(host.querySelector<HTMLSelectElement>('[aria-label="经历类别"]')?.value).toBe("__proto__"); expect(host.querySelector<HTMLSelectElement>('[aria-label="确认状态"]')?.value).toBe("__proto__"); expect(host.querySelector('[role="status"]')?.textContent).toContain("0 个结果");
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "清除搜索与筛选")!.click());
  expect(window.location.search).toBe(""); expect(host.querySelector('[role="status"]')?.textContent).toContain("2 个结果");
});
it("retries a failed read without clearing filters or claiming the collection is empty", async () => {
  await search("SQL"); await act(async () => root.render(createElement(ExperienceLibrary, { rows: [], unavailable: true })));
  expect(host.textContent).toContain("部分资料未能读取"); expect(host.textContent).not.toContain("还没有经历");
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "重新读取经历资料")!.click());
  expect(router.refresh).toHaveBeenCalledTimes(1); expect(window.location.search).toContain("q=SQL"); expect(host.querySelector("input")?.value).toBe("SQL");
});
