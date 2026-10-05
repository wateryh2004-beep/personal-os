"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { deriveHoldings } from "./calculator";
import { contentHash, parseResearchImport } from "./import-contract";
import { investmentAccountSchema, investmentEntrySchema, investmentStrategySchema, investmentVoidSchema } from "./schemas";
import type { InvestmentAccount, InvestmentActionResult, LedgerEntry } from "./types";

function value(form: FormData, key: string) { return String(form.get(key) ?? ""); }
function failure(error: unknown): InvestmentActionResult {
  return { ok: false, error: error instanceof z.ZodError ? error.issues[0]?.message ?? "请检查输入" : error instanceof Error ? error.message : "未保存，请稍后重试" };
}
function databaseFailure(code?: string): Error {
  if (code === "23505") return new Error("这个导入标识或版本已存在；请刷新后核对，不能覆盖旧记录");
  if (code === "40001") return new Error("账本刚刚有更新，请刷新后重试；本次尚未写入");
  if (code === "23514") return new Error("记录与现有持仓或日期不一致，请核对后重试");
  return new Error("投资数据未能保存。存储可能尚未启用，请稍后重试");
}
export async function createInvestmentAccount(form: FormData): Promise<InvestmentActionResult> {
  const { supabase, userId } = await requireOwner();
  try {
    const account = investmentAccountSchema.parse({ name: value(form, "name"), mode: value(form, "mode"), currency: value(form, "currency") });
    const { error } = await supabase.from("investment_accounts").insert({ ...account, user_id: userId });
    if (error) throw databaseFailure(error.code);
    revalidatePath("/investments"); return { ok: true };
  } catch (error) { return failure(error); }
}
export async function addInvestmentEntry(form: FormData): Promise<InvestmentActionResult> {
  const { supabase, userId } = await requireOwner();
  try {
    const parsed = investmentEntrySchema.parse({ account_id: value(form, "account_id"), kind: value(form, "kind"), symbol: value(form, "symbol"), occurred_on: value(form, "occurred_on"), quantity: value(form, "quantity"), price: value(form, "price").trim() || null, fees: value(form, "fees").trim() || "0", source: value(form, "source"), import_key: value(form, "import_key"), confirmed: form.get("confirmed") === "on" });
    const { confirmed: _confirmed, ...entry } = parsed; void _confirmed;
    const [accountResult, ledgerResult] = await Promise.all([
      supabase.from("investment_accounts").select("id,name,mode,currency,revision").eq("id", entry.account_id).eq("user_id", userId).is("archived_at", null).single(),
      supabase.from("investment_ledger").select("id,account_id,sequence,kind,void_entry_id,symbol,occurred_on,quantity,price,fees,source,import_key,created_at", { count: "exact" }).eq("account_id", entry.account_id).eq("user_id", userId).order("occurred_on").order("created_at").limit(5001),
    ]);
    if (accountResult.error || !accountResult.data || ledgerResult.error || (ledgerResult.data?.length ?? 0) > 5000 || ledgerResult.count === null || ledgerResult.count !== (ledgerResult.data?.length ?? 0)) throw new Error("无法完整读取该账户账本，本次没有写入");
    const account = accountResult.data as InvestmentAccount;
    const ledger = (ledgerResult.data ?? []) as LedgerEntry[];
    const hash = contentHash(entry);
    // Replay validation provides helpful feedback. SQL locks + revision check close races.
    if (!ledger.some((row) => row.import_key === entry.import_key)) deriveHoldings([account], [...ledger, { ...entry, id: entry.import_key, sequence: account.revision + 1, created_at: new Date().toISOString() }], account.mode);
    const { data, error } = await supabase.rpc("append_investment_entry", { p_account_id: account.id, p_expected_revision: account.revision, p_entry: entry, p_payload_hash: hash });
    if (error) throw databaseFailure(error.code);
    revalidatePath("/investments"); return { ok: true, duplicate: data?.duplicate === true };
  } catch (error) { return failure(error); }
}
export async function saveInvestmentStrategy(form: FormData): Promise<InvestmentActionResult> {
  const { supabase } = await requireOwner();
  try {
    const strategy = investmentStrategySchema.parse({ strategy_key: value(form, "strategy_key"), title: value(form, "title"), body_markdown: value(form, "body_markdown") });
    const { error } = await supabase.rpc("append_investment_strategy", { p_strategy: strategy });
    if (error) throw databaseFailure(error.code);
    revalidatePath("/investments"); return { ok: true };
  } catch (error) { return failure(error); }
}
export async function importInvestmentResearch(form: FormData): Promise<InvestmentActionResult> {
  const { supabase } = await requireOwner();
  try {
    const { value: run, hash } = parseResearchImport(value(form, "payload"));
    const { data, error } = await supabase.rpc("append_investment_research", { p_run: run, p_payload_hash: hash });
    if (error) throw databaseFailure(error.code);
    revalidatePath("/investments"); return { ok: true, duplicate: data?.duplicate === true };
  } catch (error) { return failure(error); }
}

export async function voidInvestmentEntry(form: FormData): Promise<InvestmentActionResult> {
  const { supabase, userId } = await requireOwner();
  try {
    const parsed = investmentVoidSchema.parse({ entry_id: value(form, "entry_id"), reason: value(form, "reason"), import_key: value(form, "import_key"), confirmed: form.get("confirmed") === "on" });
    const targetResult = await supabase.from("investment_ledger").select("id,account_id,sequence,kind,void_entry_id,symbol,occurred_on,quantity,price,fees,source,import_key,created_at").eq("id", parsed.entry_id).eq("user_id", userId).single();
    if (targetResult.error || !targetResult.data || targetResult.data.kind === "void") throw new Error("原记录不存在或不能作废");
    const target = targetResult.data as LedgerEntry;
    const [accountResult, ledgerResult] = await Promise.all([
      supabase.from("investment_accounts").select("id,name,mode,currency,revision").eq("id", target.account_id).eq("user_id", userId).is("archived_at", null).single(),
      supabase.from("investment_ledger").select("id,account_id,sequence,kind,void_entry_id,symbol,occurred_on,quantity,price,fees,source,import_key,created_at", { count: "exact" }).eq("account_id", target.account_id).eq("user_id", userId).limit(5001),
    ]);
    if (accountResult.error || !accountResult.data || ledgerResult.error || (ledgerResult.data?.length ?? 0) > 5000 || ledgerResult.count === null || ledgerResult.count !== (ledgerResult.data?.length ?? 0)) throw new Error("无法完整读取账本，本次没有作废");
    const account = accountResult.data as InvestmentAccount;
    const ledger = (ledgerResult.data ?? []) as LedgerEntry[];
    const entry = { account_id: account.id, kind: "void" as const, void_entry_id: target.id, symbol: target.symbol, occurred_on: target.occurred_on, quantity: target.quantity, price: null, fees: "0", source: parsed.reason, import_key: parsed.import_key };
    if (!ledger.some((row) => row.import_key === entry.import_key)) {
      try { deriveHoldings([account], [...ledger, { ...entry, id: entry.import_key, sequence: account.revision + 1, created_at: new Date().toISOString() }], account.mode); }
      catch { throw new Error("无法作废：记录已经作废，或作废后会使后续卖出超过可用持仓。原记录保持不变"); }
    }
    const { data, error } = await supabase.rpc("append_investment_entry", { p_account_id: account.id, p_expected_revision: account.revision, p_entry: entry, p_payload_hash: contentHash(entry) });
    if (error) throw databaseFailure(error.code);
    revalidatePath("/investments"); return { ok: true, duplicate: data?.duplicate === true };
  } catch (error) { return failure(error); }
}
