"use server";

import { requireOwner } from "@/lib/auth/require-owner";
import { storageBudgetInput } from "./budget-schema";

export async function readStorageBudget(): Promise<{ value: string; available: boolean }> {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("profiles").select("storage_budget_gib").eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (error) return { value: "", available: false };
  // A profile is optional until the owner explicitly saves a preference.
  if (!data) return { value: "", available: true };
  const value = data.storage_budget_gib == null ? "" : String(data.storage_budget_gib);
  return storageBudgetInput.safeParse(value).success ? { value, available: true } : { value: "", available: false };
}

export async function saveStorageBudget(raw: string): Promise<{ ok: boolean; value?: string; error?: string }> {
  const parsed = storageBudgetInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "请输入 0.001 到 1,000,000 GiB，最多 6 位小数；留空可清除预算。" };
  const { supabase, userId } = await requireOwner();
  const value = parsed.data === "" ? null : Number(parsed.data);
  const { data, error } = await supabase.from("profiles").update({ storage_budget_gib: value }).eq("user_id", userId).is("archived_at", null).select("storage_budget_gib").maybeSingle();
  if (error) return { ok: false, error: "预算未保存，请稍后重试。" };
  if (data) return { ok: true, value: data.storage_budget_gib == null ? "" : String(data.storage_budget_gib) };

  // Insert only on an explicit save, letting the schema supply profile defaults.
  // Never upsert/retry a uniqueness conflict: another save or an archived profile
  // may already own user_id, and its budget and other fields must stay untouched.
  const { data: created, error: createError } = await supabase.from("profiles").insert({ user_id: userId, storage_budget_gib: value }).select("storage_budget_gib").single();
  if (createError?.code === "23505") return { ok: false, error: "预算未保存；请刷新页面，核对账户资料和预算后再试。" };
  if (createError || !created) return { ok: false, error: "预算未保存，请稍后重试。" };
  return { ok: true, value: created.storage_budget_gib == null ? "" : String(created.storage_budget_gib) };
}
