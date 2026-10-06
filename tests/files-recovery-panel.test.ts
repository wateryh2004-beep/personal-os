// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileRecoveryPanel } from "@/components/files/file-recovery-panel";
let host: HTMLDivElement; let root: Root;
const plan = { format: "personal-os-files-plan/v1", planId: "a".repeat(64), counts: { documents: 2, objectBytes: 100, pending: 0 }, storage: { availableBytes: 100, archivedBytes: 0, possibleDuplicateBytes: 0 }, parts: [{ partIndex: 1, documentCount: 1, estimatedBytes: 4096 }, { partIndex: 2, documentCount: 1, estimatedBytes: 4096 }] };
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(FileRecoveryPanel)));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function prepare() { await act(async () => (Array.from(host.querySelectorAll("button")).find(b => b.textContent === "准备分包导出")!).click()); }
describe("Files recovery panel", () => {
  it("plans metadata only and keeps each native download explicitly unverified", async () => {
    const fetcher = vi.fn(async () => Response.json(plan)); vi.stubGlobal("fetch", fetcher);
    await prepare();
    expect(fetcher).toHaveBeenCalledWith("/api/files/export/plan", expect.objectContaining({ method: "POST" }));
    expect(host.textContent).toContain("2 个分包"); expect(host.textContent).toContain("不是供应商账单用量");
    const form = host.querySelector<HTMLFormElement>('form[action="/api/files/export/part"]')!;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(host.textContent).toContain("下载已发起，尚未验证完成");
    expect(host.textContent).toContain("重试第 1 包（未校验）");
    expect(form.target).toBe(host.querySelector("iframe")!.name);
    expect(fetcher).toHaveBeenCalledTimes(1); // No Blob-sized JS download.
  });
  it("shows plan errors and permits a normal retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ error: "暂时不可用" }, { status: 503 })).mockResolvedValueOnce(Response.json(plan)));
    await prepare(); expect(host.querySelector('[role="alert"]')?.textContent).toBe("暂时不可用");
    await prepare(); expect(host.querySelector('[aria-label="文件恢复包计划"]')).not.toBeNull();
  });
  it("rejects incomplete response data before rendering a broken plan", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ format: plan.format, planId: plan.planId, parts: [] })));
    await prepare(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("响应无效");
  });
  it("keeps the workspace intact when an iframe returns a changed-plan error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(plan))); await prepare();
    const frame = host.querySelector("iframe")!;
    frame.contentDocument!.body.textContent = JSON.stringify({ error: "清单已变化，请重新生成", code: "files_export_plan_changed" });
    await act(async () => frame.dispatchEvent(new Event("load")));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("清单已变化");
    expect(host.querySelector('[aria-label="文件恢复包计划"]')).toBeNull();
    expect(host.textContent).toContain("准备分包导出");
  });
});
