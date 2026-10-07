"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { investmentCashSchema, investmentCashVoidSchema, investmentQuoteImportSchema, investmentQuoteSchema } from "./daily-schemas";
import type { InvestmentActionResult } from "./types";
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
function failure(error: unknown): InvestmentActionResult {
  return { ok: false, error: error instanceof z.ZodError ? error.issues[0]?.message ?? "请检查输入" : error instanceof Error ? error.message : "保存失败，请稍后重试" };
}
function databaseError(code?: string) {
  return new Error(code === "23505" ? "导入标识已用于不同内容，请核对；旧记录未被覆盖" : code === "23514" ? "请核对期初日期、账户币种与记录内容；尚未保存" : "未能保存现金或报价。存储可能尚未启用，请稍后重试");
}
export async function addInvestmentCash(form: FormData): Promise<InvestmentActionResult> {
  const { supabase } = await requireOwner();
  try {
    const { confirmed: _confirmed, account_id, ...entry } = investmentCashSchema.parse({ account_id: value(form, "account_id"), kind: value(form, "kind"), symbol: value(form, "symbol").trim() || null, occurred_on: value(form, "occurred_on"), amount: value(form, "amount"), tax: value(form, "tax") || "0", fees: value(form, "fees") || "0", source: value(form, "source"), import_key: value(form, "import_key"), confirmed: form.get("confirmed") === "on" });
    void _confirmed;
    const { data, error } = await supabase.rpc("append_investment_cash", { p_account_id: account_id, p_entry: { ...entry, void_entry_id: null } });
    if (error) throw databaseError(error.code);
    revalidatePath("/investments"); return { ok: true, duplicate: data?.duplicate === true };
  } catch (error) { return failure(error); }
}
export async function voidInvestmentCash(form: FormData): Promise<InvestmentActionResult> {
  const { supabase } = await requireOwner();
  try {
    const entry = investmentCashVoidSchema.parse({ account_id: value(form, "account_id"), entry_id: value(form, "entry_id"), source: value(form, "source"), import_key: value(form, "import_key"), confirmed: form.get("confirmed") === "on" });
    const { data, error } = await supabase.rpc("append_investment_cash", { p_account_id: entry.account_id, p_entry: { kind: "void", void_entry_id: entry.entry_id, symbol: null, occurred_on: null, amount: "0", tax: "0", fees: "0", source: entry.source, import_key: entry.import_key } });
    if (error) throw databaseError(error.code);
    revalidatePath("/investments"); return { ok: true, duplicate: data?.duplicate === true };
  } catch (error) { return failure(error); }
}
export async function saveInvestmentQuotes(form: FormData): Promise<InvestmentActionResult> {
  const { supabase } = await requireOwner();
  try {
    const accountId = z.uuid().parse(value(form, "account_id"));
    if (form.get("confirmed") !== "on") throw new Error("请核对报价来源、币种与截至时间并确认");
    const payload = value(form, "payload").trim();
    if (payload.length > 180000) throw new Error("单次最多导入 100 条报价，JSON 不能超过 180 KB");
    const quotes = payload ? investmentQuoteImportSchema.parse(JSON.parse(payload)).quotes.map((quote) => ({ ...quote, source_kind: "imported" as const })) : [investmentQuoteSchema.parse({ symbol: value(form, "symbol"), currency: value(form, "currency"), price: value(form, "price"), as_of: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value(form, "as_of")) ? `${value(form, "as_of")}${value(form, "as_of").length === 16 ? ":00" : ""}Z` : value(form, "as_of"), source_kind: "manual", source: value(form, "source"), import_key: value(form, "import_key") })];
    const { data, error } = await supabase.rpc("append_investment_quotes", { p_account_id: accountId, p_quotes: quotes });
    if (error) throw databaseError(error.code);
    revalidatePath("/investments"); return { ok: true, duplicate: data?.duplicate === true };
  } catch (error) { return failure(error); }
}
