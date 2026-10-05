import React from "react";
import { createRoot } from "react-dom/client";
import { InvestmentWorkspace } from "@/components/investment/investment-workspace";
import { parseInvestmentView } from "@/components/investment/presentation";
import "@/app/globals.css";

// Isolated browser fixture only. These synthetic values are never app defaults.
// Query: fixture=empty|populated|unavailable, tab=holdings|strategies|research,
// mode=real|paper. Navigation preserves fixture while changing tab or mode.
const params = new URLSearchParams(window.location.search);
const { tab, mode } = parseInvestmentView({ tab: params.get("tab"), mode: params.get("mode") });
const populated = params.get("fixture") === "populated";
const accounts = [
  { id: "10000000-0000-4000-8000-000000000001", name: "UI 测试账户（实盘）", mode: "real", currency: "CNY", revision: 1 },
  { id: "10000000-0000-4000-8000-000000000002", name: "UI 测试账户（模拟）", mode: "paper", currency: "USD", revision: 1 },
];
const holdings = accounts.map((account, index) => ({ accountId: account.id, accountName: account.name, currency: account.currency, symbol: index ? "TEST:PAPER" : "TEST:REAL", quantity: index ? "4" : "12", costBasis: index ? "400" : null, realizedPnl: index ? "0" : null }));
const entries = accounts.map((account, index) => ({ id: `20000000-0000-4000-8000-00000000000${index + 1}`, account_id: account.id, sequence: 1, kind: "opening", void_entry_id: null, symbol: index ? "TEST:PAPER" : "TEST:REAL", occurred_on: "2026-10-01", quantity: index ? "4" : "12", price: index ? "100" : null, fees: "0", source: "UI 测试数据，不是真实持仓", import_key: `fixture-opening-${index}`, created_at: "2026-10-01T00:00:00Z" }));
const data = {
  accounts: populated ? accounts : [],
  entries: populated ? entries : [],
  strategies: populated ? [{ id: "30000000-0000-4000-8000-000000000001", strategy_key: "preview-only", version: 1, title: "UI 测试策略", body_markdown: "这是隔离的显示测试。\n\n判断依据、执行条件、风险与反例都会原样保留。", created_at: "2026-10-01T00:00:00Z" }] : [],
  research: populated ? [
    { id: "40000000-0000-4000-8000-000000000001", import_key: "fixture-research", title: "UI 测试研究", kind: "research", body_markdown: "这是布局测试内容，没有实际投资建议或业绩。", as_of: "2026-10-01", source_urls: ["https://example.com/research"], strategy_version_id: null, provenance: { producer: "UI fixture", limitations: "仅用于界面验证" }, metrics: null, created_at: "2026-10-01T00:00:00Z" },
    { id: "40000000-0000-4000-8000-000000000002", import_key: "fixture-backtest", title: "UI 测试回测", kind: "backtest", body_markdown: "模拟展示导入指标的布局，数字仅用于测试。", as_of: "2026-10-01", source_urls: ["https://example.com/backtest"], strategy_version_id: null, provenance: { producer: "UI fixture", dataset_snapshot: "synthetic-fixture", code_version: "fixture-v1", period_start: "2026-01-01", period_end: "2026-09-30", benchmark: "synthetic fixture", costs: "fixture only", artifact_url: "https://example.com/artifact", limitations: "合成的测试数据，不是真实回测" }, metrics: { total_return_pct: "5", max_drawdown_pct: "2" }, created_at: "2026-10-01T00:00:00Z" },
  ] : [],
  unavailable: params.get("fixture") === "unavailable",
};
const importExample = JSON.stringify({ schema_version: 1, import_key: "replace-with-unique-id", title: "填写研究标题", kind: "research", body_markdown: "填写研究观点", as_of: "2026-10-01", source_urls: ["https://example.com/replace-with-real-source"], provenance: { producer: "填写分析工具或作者", limitations: "填写局限" }, metrics: null }, null, 2);

createRoot(document.getElementById("root")).render(
  <main className="mx-auto max-w-[1240px] px-5 py-8">
    <p className="mb-7 text-[12px] text-[var(--text-tertiary)]">隔离 UI 预览 · 合成测试数据 · 不连接任何数据库</p>
    <InvestmentWorkspace data={data} holdings={populated ? holdings.filter((holding) => accounts.find((account) => account.id === holding.accountId)?.mode === mode) : []} tab={tab} mode={mode} importExample={importExample} />
  </main>,
);
