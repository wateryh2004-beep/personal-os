// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Holding, InvestmentWorkspaceData, ResearchRun } from "@/features/investment/types";
import { formatInvestmentDecimal, investmentHref, parseInvestmentView, safeResearchUrl } from "@/components/investment/presentation";

const mocks = vi.hoisted(() => ({ account: vi.fn(), entry: vi.fn(), strategy: vi.fn(), research: vi.fn(), voidEntry: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, scroll: _scroll, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { scroll?: boolean }) => { void _scroll; return createElement("a", props, children); } }));
vi.mock("@/features/investment/actions", () => ({ createInvestmentAccount: mocks.account, addInvestmentEntry: mocks.entry, saveInvestmentStrategy: mocks.strategy, importInvestmentResearch: mocks.research, voidInvestmentEntry: mocks.voidEntry }));
import { InvestmentWorkspace } from "@/components/investment/investment-workspace";

let host: HTMLDivElement;
let root: Root;
const empty: InvestmentWorkspaceData = { accounts: [], entries: [], strategies: [], research: [], unavailable: false };
const account = { id: "00000000-0000-4000-8000-000000000001", name: "Test real account", mode: "real" as const, currency: "CNY" as const, revision: 0 };
const paperAccount = { ...account, id: "00000000-0000-4000-8000-000000000002", name: "Test paper account", mode: "paper" as const };
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text)!;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const field = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
async function click(text: string) { await act(async () => button(text).click()); }
async function submit() { await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function render(data = empty, tab: "holdings" | "strategies" | "research" = "holdings", mode: "real" | "paper" = "real", holdings: Holding[] = []) {
  await act(async () => root.render(createElement(InvestmentWorkspace, { key: `${tab}:${mode}`, data, holdings, tab, mode, importExample: "test schema example" })));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("investment view and data honesty", () => {
  it("normalizes URL state and preserves the other selection in each link", async () => {
    expect(parseInvestmentView({ tab: ["research"], mode: "unknown" })).toEqual({ tab: "holdings", mode: "real" });
    expect(parseInvestmentView({ tab: "research", mode: "paper" })).toEqual({ tab: "research", mode: "paper" });
    expect(investmentHref("strategies", "paper")).toBe("/investments?tab=strategies&mode=paper");
    await render(empty, "strategies", "paper");
    expect(host.querySelector('[aria-label="投资视图"] a[aria-current="page"]')?.textContent).toBe("策略");
    expect([...host.querySelectorAll('a')].map((item) => item.getAttribute('href'))).toContain('/investments?tab=research&mode=paper');
    expect([...host.querySelectorAll('a')].map((item) => item.getAttribute('href'))).toContain('/investments?tab=strategies&mode=real');
    expect(host.textContent).toContain("共享策略库");
  });

  it("keeps no-data distinct from a failed read and disables all writes when unavailable", async () => {
    await render();
    expect(host.textContent).toContain("从一笔真实持仓开始");
    expect(host.textContent).not.toContain("总资产");
    await render({ ...empty, unavailable: true });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("投资数据暂时无法读取");
    expect(host.textContent).not.toContain("从一笔真实持仓开始");
    expect(button("添加账户").disabled).toBe(true);
    await render({ ...empty, unavailable: true }, "research");
    expect(button("导入研究").disabled).toBe(true);
    expect(host.textContent).not.toContain("把有依据的研究留在这里");
  });

  it("isolates account modes and displays unknown basis and absent prices honestly", async () => {
    await render({ ...empty, accounts: [account, paperAccount] }, "holdings", "real", [{ accountId: account.id, accountName: account.name, currency: "CNY", symbol: "TEST", quantity: "0.00000001", costBasis: null, realizedPnl: null }]);
    expect(host.textContent).toContain(account.name);
    expect(host.textContent).not.toContain(paperAccount.name);
    expect(host.textContent).toContain("左右滑动查看完整持仓");
    expect(host.textContent).toContain("成本未知");
    expect(host.textContent).toContain("无法计算");
    expect(host.textContent).toContain("暂无估值");
    expect(host.textContent).toContain("0.00000001");
    expect(formatInvestmentDecimal("123456.12000000")).toBe("123,456.12");
    expect(formatInvestmentDecimal("-1234.00000001")).toBe("-1,234.00000001");
  });

  it("never renders quant results for research opinions and sanitizes source links", async () => {
    const research: ResearchRun = { id: "run-1", import_key: "run-1", title: "Fixture opinion", kind: "research", body_markdown: "Research body", as_of: "2026-10-01", source_urls: ["javascript:alert(1)", "https://example.com/research"], strategy_version_id: null, provenance: { producer: "test", limitations: "Unverified fixture" }, metrics: { total_return_pct: "999", max_drawdown_pct: "2" }, created_at: "2026-10-01T00:00:00Z" };
    await render({ ...empty, research: [research] }, "research");
    expect(host.textContent).toContain("研究观点");
    expect(host.textContent).not.toContain("999%");
    expect(host.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(host.querySelector('a[href="https://example.com/research"]')?.getAttribute("rel")).toBe("noreferrer");
    expect(safeResearchUrl("data:text/html,unsafe")).toBeNull();
  });
});

describe("investment form interactions", () => {
  it("cancels without writing and restores focus to the opener", async () => {
    await render();
    const trigger = button("添加账户"); trigger.focus();
    await click("添加账户");
    expect(document.getElementById(dialog()!.getAttribute("aria-labelledby")!)?.textContent).toBe("添加实盘账户");
    expect(field("name").labels?.[0]?.textContent).toBe("账户名称");
    field("name").value = "Unsubmitted";
    await click("取消");
    expect(dialog()).toBeNull();
    expect(mocks.account).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    await click("添加账户");
    expect(field("name").value).toBe("");
  });

  it("preserves failed inputs and refreshes only after confirmed success", async () => {
    mocks.account.mockResolvedValueOnce({ ok: false, error: "Storage not ready" }).mockResolvedValueOnce({ ok: true });
    await render(); await click("添加账户");
    field("name").value = "My account";
    await submit();
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toBe("Storage not ready");
    expect(field("name").value).toBe("My account");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await submit();
    expect(mocks.account).toHaveBeenCalledTimes(2);
    expect(mocks.account.mock.calls[1][0].get("mode")).toBe("real");
    expect(mocks.account.mock.calls[1][0].get("name")).toBe("My account");
    expect(dialog()).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("账户已创建");
  });

  it("locks repeated submission, Escape and cancellation while a save is pending", async () => {
    let finish!: (result: { ok: boolean }) => void;
    mocks.account.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(); await click("添加账户");
    const form = document.querySelector("form")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mocks.account).toHaveBeenCalledOnce();
    expect(button("取消").disabled).toBe(true);
    expect(button("保存中…").disabled).toBe(true);
    expect(dialog()!.querySelector("fieldset")!.disabled).toBe(true);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(dialog()).not.toBeNull();
    await act(async () => finish({ ok: true }));
    expect(dialog()).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("retains one ledger import key across retries and only offers the active mode accounts", async () => {
    mocks.entry.mockResolvedValueOnce({ ok: false, error: "Try again" }).mockResolvedValueOnce({ ok: true, duplicate: true });
    await render({ ...empty, accounts: [account, paperAccount] });
    await click("记录持仓");
    expect(document.querySelectorAll('[name="account_id"] option')).toHaveLength(1);
    const importKey = field("import_key").value;
    field("symbol").value = "TEST"; field("quantity").value = "2"; field("source").value = "Fixture"; field("confirmed").checked = true;
    await submit();
    expect(field("import_key").value).toBe(importKey);
    expect(field("symbol").value).toBe("TEST");
    await submit();
    expect(mocks.entry.mock.calls[0][0].get("import_key")).toBe(importKey);
    expect(mocks.entry.mock.calls[1][0].get("import_key")).toBe(importKey);
    expect(host.querySelector('[role="status"]')?.textContent).toContain("没有重复添加");
  });

  it("creates an immutable strategy revision and does not prefill a research artifact", async () => {
    const strategy = { id: "strategy-1", strategy_key: "fixture", version: 1, title: "Fixture strategy", body_markdown: "Original thesis", created_at: "2026-10-01T00:00:00Z" };
    await render({ ...empty, strategies: [strategy] }, "strategies");
    await click("基于此版本修订");
    expect(field("strategy_key").readOnly).toBe(true);
    expect(field("strategy_key").value).toBe("fixture");
    expect(field("body_markdown").value).toBe("Original thesis");
    await click("取消");
    await render(empty, "research");
    await click("导入研究");
    expect(field("payload").value).toBe("");
    expect(dialog()!.textContent).toContain("模板只说明格式");
    expect(mocks.research).not.toHaveBeenCalled();
  });
  it("requires a reason and confirmation to void, preserves the original on rejection, and hides repeat void actions", async () => {
    const entry = { id: "entry-original", account_id: account.id, sequence: 1, kind: "opening" as const, symbol: "TEST", occurred_on: "2026-10-01", quantity: "2", price: null, fees: "0", source: "Fixture source", import_key: "fixture-key", created_at: "2026-10-01T00:00:00Z" };
    mocks.voidEntry.mockResolvedValueOnce({ ok: false, error: "Later sale depends on this holding" });
    await render({ ...empty, accounts: [account], entries: [entry] });
    await click("作废");
    expect(field("entry_id").value).toBe(entry.id);
    expect(field("reason").required).toBe(true);
    expect(field("confirmed").required).toBe(true);
    const importKey = field("import_key").value;
    field("reason").value = "Wrong quantity"; field("confirmed").checked = true;
    await submit();
    expect(field("reason").value).toBe("Wrong quantity");
    expect(field("import_key").value).toBe(importKey);
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain("Later sale depends");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await click("取消");
    expect(host.textContent).toContain("Fixture source");
    expect(button("作废")).toBeDefined();
    await render({ ...empty, accounts: [account], entries: [entry, { ...entry, id: "entry-void", kind: "void", void_entry_id: entry.id, source: "Wrong quantity" }] });
    expect(button("作废")).toBeUndefined();
    expect(host.textContent).toContain("已作废");
    expect(host.textContent).toContain("作废原因：Wrong quantity");
  });

  it("dismisses the mobile form on Back and does not resurrect it on Forward", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    window.history.replaceState({}, "", "/investments?tab=holdings&mode=real");
    await render(); await click("添加账户");
    expect(window.history.state.__personalOsMobileLayer).toContain("investment-form:");
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 40)); });
    expect(dialog()).toBeNull();
    expect(window.location.search).toBe("?tab=holdings&mode=real");
    await act(async () => { window.history.forward(); await new Promise((resolve) => setTimeout(resolve, 40)); });
    expect(dialog()).toBeNull();
    expect(mocks.account).not.toHaveBeenCalled();
  });

  it("restores the mobile Back entry while a write is pending", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    window.history.replaceState({}, "", "/investments?tab=holdings&mode=paper");
    let finish!: (result: { ok: boolean; error: string }) => void;
    mocks.account.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(empty, "holdings", "paper"); await click("添加账户"); await submit();
    const marker = window.history.state.__personalOsMobileLayer;
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 40)); });
    expect(dialog()).not.toBeNull();
    expect(window.history.state.__personalOsMobileLayer).toBe(marker);
    expect(mocks.account).toHaveBeenCalledOnce();
    await act(async () => finish({ ok: false, error: "Not saved" }));
    await click("取消");
  });

});
