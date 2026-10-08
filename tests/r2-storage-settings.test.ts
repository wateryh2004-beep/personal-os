// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { R2StorageSettings, storageBytes } from "@/components/settings/r2-storage-settings";
import type { StorageInspection } from "@/features/files/storage-inspection/contract";
const budgetApi = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/features/files/storage-inspection/budget-actions", () => ({ saveStorageBudget: budgetApi.save }));
let host: HTMLDivElement; let root: Root;
const fixture = (): StorageInspection => ({
  checkedAt: new Date().toISOString(),
  health: { configured: true, endpointValid: true, bucket: "fixture-private", credentialsReachR2: true, status: "ok" },
  logical: { status: "complete", records: 4, activeBytes: 1024, archivedBytes: 512, pendingBytes: 256 },
  usage: { status: "complete", objectCount: 6, objectBytes: 4096, pagesScanned: 1 },
});
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetcher = vi.fn(async () => Response.json(fixture())); vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(R2StorageSettings)));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function click(label = "检查并统计用量") { await act(async () => Array.from(host.querySelectorAll("button")).find(button => button.textContent === label)!.click()); }

describe("R2 Settings inspection UI", () => {
  it("starts unknown, performs no automatic request and separates actual from logical storage", async () => {
    expect(fetcher).not.toHaveBeenCalled(); expect(host.textContent).toContain("尚未检查");
    await click();
    expect(fetcher).toHaveBeenCalledWith("/api/files/storage-inspection", expect.objectContaining({ method: "POST", body: '{"scan":true}', cache: "no-store" }));
    expect(host.textContent).toContain("合计：4 KiB");
    expect(host.textContent).toContain("可用文件 1 KiB");
    expect(host.textContent).toContain("不是 Cloudflare 账单");
    expect(host.textContent).toContain("对象内容读写、浏览器跨域与每个文件完整性未检测");
  });
  it("does not misrepresent unavailable storage as empty or zero", async () => {
    const result = fixture(); result.logical.status = "unavailable";
    result.usage = { status: "unavailable", reason: "access_denied", objectCount: 0, objectBytes: 0, pagesScanned: 0 };
    fetcher.mockResolvedValue(Response.json(result)); await click();
    expect(host.textContent).toContain("实际用量未知"); expect(host.textContent).toContain("未取得总量");
    expect(host.textContent).not.toContain("合计：0"); expect(host.textContent).not.toContain("共 0 条");
  });
  it("marks bounded partial totals and expired snapshots plainly", async () => {
    const result = fixture(); result.checkedAt = new Date(Date.now() - 6 * 60_000).toISOString();
    result.usage = { status: "partial", reason: "limit", objectCount: 20_000, objectBytes: 4096, pagesScanned: 20 };
    fetcher.mockResolvedValue(Response.json(result)); await click();
    expect(host.textContent).toContain("已统计部分：4 KiB"); expect(host.textContent).toContain("未完成，不是总量");
    expect(host.textContent).toContain("达到本次扫描上限"); expect(host.textContent).toContain("超过 5 分钟");
  });
  it("preserves the prior snapshot on failure and allows retry", async () => {
    await click(); fetcher.mockResolvedValueOnce(Response.json({}, { status: 503 }));
    await click(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("下方保留上次快照");
    expect(host.textContent).toContain("合计：4 KiB");
    await click(); expect(host.querySelector('[role="alert"]')).toBeNull();
  });
  it("rejects malformed responses without crashing or inventing totals", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ checkedAt: "bad" })); await click();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("检测响应无效");
    expect(host.textContent).toContain("尚未检查");
  });
  it("guards repeated clicks and cancels the pending UI request on unmount", async () => {
    let finish!: (response: Response) => void;
    fetcher.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    await click();
    expect(Array.from(host.querySelectorAll("button")).every(button => button.disabled)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    finish(Response.json(fixture()));
    root = createRoot(host);
  });
  it("formats bytes in explicit binary units", () => {
    expect(storageBytes(0)).toBe("0 B"); expect(storageBytes(1024 ** 3)).toBe("1 GiB");
  });
});

it("never treats account free allowance as bucket remaining capacity", async () => {
  await click();
  expect(host.textContent).toContain("免费余量：暂无法确认");
  expect(host.querySelector('[role="meter"]')).toBeNull();
  const input = host.querySelector('input[type="number"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "1");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(host.querySelector('[role="meter"]')).not.toBeNull();
  expect(host.textContent).toContain("预算内余量");
});
it("does not render a green latest-success claim after 401", async () => {
  await click();
  fetcher.mockResolvedValueOnce(Response.json({}, { status: 401 }));
  await click();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("会话已失效");
  expect(host.textContent).toContain("上次连接检查");
});

it("restores the saved budget after remount and explicitly saves edits", async () => {
  await act(async () => root.unmount()); root = createRoot(host);
  await act(async () => root.render(createElement(R2StorageSettings, { initialBudget: {value:"8",available:true} })));
  const input=host.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(input.value).toBe("8");
  await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"12");input.dispatchEvent(new Event("input",{bubbles:true}));});
  budgetApi.save.mockResolvedValue({ok:true,value:"12"});
  await click("保存预算");
  expect(budgetApi.save).toHaveBeenLastCalledWith("12");
  expect(host.textContent).toContain("已保存，可在其他设备继续使用");
  await act(async () => root.unmount()); root=createRoot(host);
  await act(async () => root.render(createElement(R2StorageSettings,{initialBudget:{value:"12",available:true}})));
  expect(host.querySelector<HTMLInputElement>("input")!.value).toBe("12");
});
it("keeps failed edits retryable without claiming persistence", async () => {
  const input=host.querySelector<HTMLInputElement>("input")!;
  await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"2");input.dispatchEvent(new Event("input",{bubbles:true}));});
  budgetApi.save.mockResolvedValue({ok:false,error:"预算未保存，请重试。"});
  await click("保存预算");expect(host.textContent).toContain("预算未保存");expect(input.value).toBe("2");
  expect(Array.from(host.querySelectorAll("button")).find(b=>b.textContent==="保存预算")!.disabled).toBe(false);
});
