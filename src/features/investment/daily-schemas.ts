import { z } from "zod";
import { decimalUnits } from "./calculator";
const amount = z.string().trim().regex(/^\d{1,12}(\.\d{1,8})?$/, "请输入非负数字，最多 8 位小数");
const symbol = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9.:-]{0,39}$/, "请填写市场与标的代码");
const source = z.string().trim().min(1, "请注明原始来源").max(500);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10), "请填写已发生的真实日期");
export const investmentCashSchema = z.object({
  account_id: z.uuid(), kind: z.enum(["opening", "deposit", "withdrawal", "dividend", "fee"]), symbol: symbol.nullable(), occurred_on: date,
  amount, tax: amount, fees: amount, source, import_key: z.uuid(), confirmed: z.literal(true, "请核对记录并确认"),
}).strict().superRefine((entry, context) => {
  if (![entry.amount, entry.tax, entry.fees].every((value) => /^\d{1,12}(\.\d{1,8})?$/.test(value))) return;
  if (entry.kind !== "opening" && decimalUnits(entry.amount) === BigInt(0)) context.addIssue({ code: "custom", message: "金额必须大于 0" });
  if (entry.kind === "dividend") {
    if (!entry.symbol) context.addIssue({ code: "custom", message: "分红需要标的代码" });
    if (decimalUnits(entry.tax) + decimalUnits(entry.fees) > decimalUnits(entry.amount)) context.addIssue({ code: "custom", message: "税费不能超过分红总额" });
  } else if (entry.symbol !== null || decimalUnits(entry.tax) !== BigInt(0) || decimalUnits(entry.fees) !== BigInt(0)) context.addIssue({ code: "custom", message: "仅分红记录使用标的代码与税费字段" });
});
export const investmentQuoteSchema = z.object({
  symbol, currency: z.enum(["CNY", "USD", "HKD"]), price: amount,
  as_of: z.iso.datetime({ offset: true }).refine((value) => Date.parse(value) <= Date.now(), "报价时间不能在未来"),
  source_kind: z.enum(["manual", "imported"]), source, import_key: z.uuid(),
}).strict();
export const investmentQuoteImportSchema = z.object({ schema_version: z.literal(1), quotes: z.array(investmentQuoteSchema.omit({ source_kind: true })).min(1).max(100) }).strict().superRefine((value, context) => {
  if (new Set(value.quotes.map((quote) => quote.import_key)).size !== value.quotes.length) context.addIssue({ code: "custom", message: "同一批导入标识不能重复" });
});
export const investmentCashVoidSchema = z.object({ account_id: z.uuid(), entry_id: z.uuid(), source, import_key: z.uuid(), confirmed: z.literal(true, "请确认作废只会更正账本") }).strict();
