import { z } from "zod";
import { decimalUnits } from "./calculator";

const decimal = z.string().trim().regex(/^\d{1,12}(\.\d{1,8})?$/, "请输入非负数字，最多 8 位小数");
const positiveDecimal = decimal.refine((value) => decimalUnits(value) > BigInt(0), "数量必须大于 0");
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, "请输入真实日期");
const httpUrl = z.url().max(2000).refine((url) => /^https?:\/\//.test(url), "来源须为 HTTP(S) 链接");
export const investmentAccountSchema = z.object({ name: z.string().trim().min(1).max(80), mode: z.enum(["real", "paper"]), currency: z.enum(["CNY", "USD", "HKD"]) }).strict();
export const investmentEntrySchema = z.object({ account_id: z.uuid(), kind: z.enum(["opening", "buy", "sell"]), symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9.:-]{0,39}$/, "使用市场和代码，如 XSHG:510300"), occurred_on: dateOnly, quantity: positiveDecimal, price: decimal.nullable(), fees: decimal, source: z.string().trim().min(1, "请注明记录来源").max(500), import_key: z.uuid(), confirmed: z.literal(true, "请先确认这是真实成交或明确的模拟记录") }).strict().superRefine((entry, context) => { if (entry.kind !== "opening" && entry.price === null) context.addIssue({ code: "custom", path: ["price"], message: "买卖记录需要成交价格" }); if (entry.occurred_on > new Date().toISOString().slice(0, 10)) context.addIssue({ code: "custom", path: ["occurred_on"], message: "不能把未来计划记为已经发生的交易" }); });
export const investmentStrategySchema = z.object({ strategy_key: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/, "策略标识使用小写字母、数字和短横线"), title: z.string().trim().min(1).max(160), body_markdown: z.string().trim().min(1).max(40000) }).strict();
const provenanceSchema = z.object({ producer: z.string().trim().min(1).max(200), dataset_snapshot: z.string().trim().max(1000).optional(), code_version: z.string().trim().max(200).optional(), period_start: dateOnly.optional(), period_end: dateOnly.optional(), benchmark: z.string().trim().max(200).optional(), costs: z.string().trim().max(2000).optional(), limitations: z.string().trim().min(1).max(4000), artifact_url: httpUrl.optional() }).strict();
export const investmentResearchSchema = z.object({ schema_version: z.literal(1), import_key: z.string().trim().min(1).max(160), title: z.string().trim().min(1).max(160), kind: z.enum(["research", "backtest"]), body_markdown: z.string().trim().min(1).max(60000), as_of: dateOnly, source_urls: z.array(httpUrl).min(1).max(30), strategy_version_id: z.uuid().nullable().default(null), provenance: provenanceSchema, metrics: z.object({ total_return_pct: z.string().regex(/^-?\d{1,6}(\.\d{1,4})?$/), max_drawdown_pct: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/).refine((value) => Number(value) <= 100) }).strict().nullable().default(null) }).strict().superRefine((run, context) => {
  if (run.kind === "research" && run.metrics !== null) context.addIssue({ code: "custom", path: ["metrics"], message: "研究观点不能携带回测业绩指标" });
  if (run.kind === "backtest") {
    if (!run.metrics) context.addIssue({ code: "custom", path: ["metrics"], message: "回测需要结果指标" });
    for (const field of ["dataset_snapshot", "code_version", "period_start", "period_end", "benchmark", "costs", "artifact_url"] as const) if (!run.provenance[field]) context.addIssue({ code: "custom", path: ["provenance", field], message: `回测缺少 ${field}` });
    if (run.provenance.period_start && run.provenance.period_end && (run.provenance.period_start > run.provenance.period_end || run.provenance.period_end > run.as_of)) context.addIssue({ code: "custom", message: "回测区间须有序且不晚于数据截止日" });
    if (run.metrics && Number(run.metrics.total_return_pct) < -100) context.addIssue({ code: "custom", message: "当前仅支持无杠杆收益口径，累计收益不能低于 -100%" });
  }
});
export const RESEARCH_IMPORT_EXAMPLE = JSON.stringify({ schema_version: 1, import_key: "replace-with-unique-research-id", title: "填写研究标题", kind: "research", body_markdown: "填写研究逻辑、证据、反例和待验证问题。", as_of: "2026-10-05", source_urls: ["https://www.investor.gov/"], strategy_version_id: null, provenance: { producer: "填写分析者或工具版本", limitations: "研究观点尚未验证，不代表实际收益。" }, metrics: null }, null, 2);

export const investmentVoidSchema = z.object({ entry_id: z.uuid(), reason: z.string().trim().min(1, "请说明为什么作废").max(500), import_key: z.uuid(), confirmed: z.literal(true, "请确认作废仅更正账本，不会撤销实际交易") }).strict();
