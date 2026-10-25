import "server-only";
import { z } from "zod";
import { deriveInvestmentDaily } from "@/features/investment/daily-calculator";
import { investmentResearchSchema } from "@/features/investment/schemas";
import type { requireOwnerApi } from "@/lib/auth/require-owner";
import { getNoteDocument } from "@/features/notes/queries";
import type { WorkbenchEntity, WorkbenchField, WorkbenchReadResult, WorkbenchRef } from "./contracts";

type Owner = Awaited<ReturnType<typeof requireOwnerApi>>;
const field = (key: string, label: string, value: string | number | null | undefined): WorkbenchField => ({ key, label, value: value === null || value === undefined || value === "" ? null : String(value) });
const sourceUrls = (...values: (string | null | undefined)[]) => values.flatMap((value) => {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? [url.href] : []; } catch { return []; }
});
/** Every branch selects a fixed projection and explicitly scopes both entity and parent. */
export async function readWorkbenchEntity(ref: WorkbenchRef, owner: Owner): Promise<WorkbenchReadResult> {
  const { supabase, userId } = owner;
  const base = (title: string, href: string, fields: WorkbenchField[], extra: Partial<WorkbenchEntity> = {}): WorkbenchReadResult => ({ status: "ready", entity: { ref, title, href, fields, subtitle: null, sourceUrls: [], asOf: null, ...extra } });
  const missing: WorkbenchReadResult = { status: "missing", ref };
  const unavailable: WorkbenchReadResult = { status: "unavailable", ref };
  try {
    if (ref.kind === "note") {
      // Ordinary workbench reads never acquire the separate vault capability.
      const visible = await supabase.from("notes").select("id").eq("id", ref.id).eq("user_id", userId).is("vault_group_id", null).is("archived_at", null).is("deleted_at", null).neq("status", "archived").neq("status", "trashed").maybeSingle();
      if (visible.error) return unavailable;
      if (!visible.data) return missing;
      const data = await getNoteDocument(ref.id, owner);
      if (!data || data.note.archived_at || data.note.deleted_at || data.note.status === "archived" || data.note.status === "trashed") return missing;
      let attachments = data.attachments;
      if (attachments.length) {
        const permitted = await supabase.from("documents").select("id").eq("user_id", userId).in("id", attachments.map((file) => file.id)).is("vault_group_id", null).is("archived_at", null).eq("storage_state", "available");
        if (permitted.error) return unavailable;
        const visibleIds = new Set((permitted.data ?? []).map((file) => file.id));
        attachments = attachments.filter((file) => visibleIds.has(file.id));
      }
      const primary = attachments.find((file) => file.role === "primary_pdf" && file.mime_type === "application/pdf");
      return base(data.note.title, `/notes/${ref.id}`, [field("updated", "更新", data.note.updated_at)], { note: data.note, attachments, asOf: data.note.updated_at, ...(primary ? { pdf: { documentId: primary.id, title: primary.title } } : {}) });
    }
    if (ref.kind === "document") {
      const { data, error } = await supabase.from("documents").select("id,title,original_filename,mime_type,file_size,updated_at").is("vault_group_id", null).eq("user_id", userId).eq("id", ref.id).eq("storage_provider", "cloudflare_r2").eq("storage_state", "available").is("archived_at", null).maybeSingle();
      if (error) return unavailable; if (!data) return missing;
      return base(data.title, `/files?file=${ref.id}`, [field("format", "格式", data.mime_type), field("size", "字节", data.file_size), field("filename", "原文件名", data.original_filename)], { asOf: data.updated_at, ...(data.mime_type === "application/pdf" ? { pdf: { documentId: data.id, title: data.title } } : {}) });
    }
    if (ref.kind === "shopping") {
      const { data, error } = await supabase.from("purchase_items").select("id,title,category,price_cny,quantity,quantity_unit,necessity,necessity_confirmed,status,cooldown_until,reason_to_buy,existing_alternative,expected_usage,notes_markdown,source_url,updated_at").eq("id", ref.id).eq("user_id", userId).is("archived_at", null).maybeSingle();
      if (error) return unavailable; if (!data) return missing;
      return base(data.title, `/shopping/${ref.id}`, [field("quantity", "数量", data.quantity), field("unit", "单位", data.quantity_unit), field("category", "类别", data.category), field("price", "价格（CNY）", data.price_cny), field("necessity", "必要性", data.necessity === "necessary" ? "必要" : data.necessity === "nonessential" ? "非必要" : "未判断"), field("confirmed", "必要性已确认", data.necessity_confirmed ? "是" : "否"), field("status", "状态", data.status), field("cooldown", "冷静期截止", data.cooldown_until), field("reason", "购买理由", data.reason_to_buy), field("alternative", "已有替代", data.existing_alternative), field("usage", "预计用途", data.expected_usage)], { currency: "CNY", bodyMarkdown: data.notes_markdown, sourceUrls: sourceUrls(data.source_url), asOf: data.updated_at });
    }
    if (ref.kind === "opportunity") {
      const { data, error } = await supabase.from("career_opportunities").select("id,organization,role_title,location,work_mode,compensation_text,recruitment_cycle,deadline_at,expected_start_date,status,jd_markdown,source_name,source_url,updated_at").eq("id", ref.id).eq("user_id", userId).is("archived_at", null).neq("status", "archived").maybeSingle();
      if (error) return unavailable; if (!data) return missing;
      return base(data.role_title, `/career/opportunities#opportunity-${ref.id}`, [field("organization", "机构", data.organization), field("location", "地点", data.location), field("workMode", "办公方式", data.work_mode), field("compensation", "薪资原文", data.compensation_text), field("cycle", "招聘周期", data.recruitment_cycle), field("deadline", "截止", data.deadline_at), field("start", "预期开始", data.expected_start_date), field("status", "状态", data.status), field("source", "来源", data.source_name)], { subtitle: data.organization, bodyMarkdown: data.jd_markdown, sourceUrls: sourceUrls(data.source_url), asOf: data.updated_at });
    }
    if (ref.kind === "trip") {
      const { data, error } = await supabase.from("trips").select("id,title,destination_label,start_date,end_date,budget_cny,status,description,notes_markdown,updated_at").eq("id", ref.id).eq("user_id", userId).is("archived_at", null).maybeSingle();
      if (error) return unavailable; if (!data) return missing;
      return base(data.title, `/travel/${ref.id}`, [field("destination", "目的地", data.destination_label), field("start", "开始", data.start_date), field("end", "结束", data.end_date), field("budget", "预算（CNY）", data.budget_cny), field("status", "状态", data.status), field("description", "计划", data.description)], { bodyMarkdown: data.notes_markdown, currency: "CNY", asOf: data.updated_at });
    }
    if (ref.kind === "task") {
      const { data, error } = await supabase.from("microsoft_todo_tasks").select("id,title,status,importance,due_at,body_text,last_synced_at").eq("id", ref.id).eq("user_id", userId).is("archived_at", null).maybeSingle();
      if (error) return unavailable; if (!data) return missing;
      return base(data.title, `/tasks?task=${ref.id}`, [field("status", "状态", data.status), field("importance", "重要性", data.importance), field("due", "截止", data.due_at), field("body", "备注", data.body_text)], { subtitle: "Microsoft To Do 缓存", asOf: data.last_synced_at });
    }
    if (ref.kind === "event") {
      const { data, error } = await supabase.from("calendar_events").select("id,subject,starts_at,ends_at,location_name,body_text,last_synced_at").eq("id", ref.id).eq("user_id", userId).is("archived_at", null).maybeSingle();
      if (error) return unavailable; if (!data) return missing;
      return base(data.subject, `/calendar?event=${ref.id}`, [field("start", "开始", data.starts_at), field("end", "结束", data.ends_at), field("location", "地点", data.location_name), field("body", "备注", data.body_text)], { subtitle: "Outlook 缓存", asOf: data.last_synced_at });
    }
    if (ref.kind === "project") {
      const { data, error } = await supabase.from("projects").select("id,name,status,start_date,due_date,description,updated_at").eq("id", ref.id).eq("user_id", userId).is("archived_at", null).maybeSingle();
      if (error) return unavailable; if (!data) return missing;
      return base(data.name, `/projects#project-${ref.id}`, [field("status", "状态", data.status), field("start", "开始", data.start_date), field("due", "截止", data.due_date), field("description", "说明", data.description)], { asOf: data.updated_at });
    }
    if (ref.kind === "leisure") {
      const { data, error } = await supabase.from("leisure_experiences").select("id,title,kind,why,how_to_start,body_markdown,platform,location,starts_at,cost_text,updated_at").eq("id", ref.id).eq("user_id", userId).is("archived_at", null).maybeSingle();
      if (error) return unavailable; if (!data) return missing;
      return base(data.title, `/leisure/${ref.id}`, [field("kind", "类型", data.kind), field("why", "想做的原因", data.why), field("start", "如何开始", data.how_to_start), field("platform", "平台", data.platform), field("location", "地点", data.location), field("time", "时间", data.starts_at), field("cost", "费用原文", data.cost_text)], { bodyMarkdown: data.body_markdown, asOf: data.updated_at });
    }
    if (ref.kind === "investment") {
      const subtype = ref.investmentType ?? "account";
      if (subtype === "strategy") {
        const { data, error } = await supabase.from("investment_strategy_versions").select("id,title,version,body_markdown,created_at").eq("id", ref.id).eq("user_id", userId).is("archived_at", null).maybeSingle();
        if (error) return unavailable; if (!data) return missing;
        return base(data.title, `/investments?tab=strategies&item=${ref.id}`, [field("version", "版本", data.version)], { bodyMarkdown: data.body_markdown, asOf: data.created_at });
      }
      if (subtype === "research") {
        const { data, error } = await supabase.from("investment_research_runs").select("id,title,kind,body_markdown,as_of,source_urls,created_at,import_key,strategy_version_id,provenance,metrics").eq("id", ref.id).eq("user_id", userId).is("archived_at", null).maybeSingle();
        if (error) return unavailable; if (!data) return missing;
        const run = investmentResearchSchema.safeParse({ schema_version: 1, import_key: data.import_key, title: data.title, kind: data.kind, body_markdown: data.body_markdown, as_of: data.as_of, source_urls: data.source_urls, strategy_version_id: data.strategy_version_id, provenance: data.provenance, metrics: data.metrics });
        if (!run.success) return unavailable;
        return base(data.title, `/investments?tab=research&item=${ref.id}`, [field("kind", "记录类型", data.kind === "backtest" ? "外部回测 · 未独立复现" : "研究观点"), field("asOf", "截至", data.as_of), field("producer", "研究来源", run.data.provenance.producer), field("limitations", "研究限制", run.data.provenance.limitations), ...(run.data.metrics ? [field("totalReturn", "回测累计收益（%）", run.data.metrics.total_return_pct), field("drawdown", "回测最大回撤（%）", run.data.metrics.max_drawdown_pct)] : [])], { bodyMarkdown: data.body_markdown, sourceUrls: sourceUrls(...data.source_urls), asOf: data.as_of });
      }
      if (subtype === "ledger") {
        const { data, error } = await supabase.from("investment_ledger").select("id,account_id,kind,symbol,quantity,price,fees,occurred_on,source,created_at").eq("id", ref.id).eq("user_id", userId).maybeSingle();
        if (error) return unavailable; if (!data) return missing;
        const account = await supabase.from("investment_accounts").select("id,name,currency,mode").eq("id", data.account_id).eq("user_id", userId).is("archived_at", null).maybeSingle();
        if (account.error) return unavailable; if (!account.data) return missing;
        return base(`${data.symbol} · ${data.occurred_on}`, `/investments?tab=holdings&mode=${account.data.mode}&item=${account.data.id}`, [field("account", "账户", account.data.name), field("kind", "类型", data.kind), field("quantity", "数量", data.quantity), field("price", "单价（原币）", data.price), field("fees", "费用（原币）", data.fees), field("source", "记录来源", data.source)], { currency: account.data.currency, mode: account.data.mode as "real" | "paper", asOf: data.occurred_on });
      }
      const { data, error } = await supabase.from("investment_accounts").select("id,name,mode,currency,revision,updated_at").eq("id", ref.id).eq("user_id", userId).is("archived_at", null).maybeSingle();
      if (error) return unavailable; if (!data) return missing;
      const account = { id: data.id, name: data.name, mode: z.enum(["real", "paper"]).parse(data.mode), currency: z.enum(["CNY", "USD", "HKD"]).parse(data.currency), revision: data.revision };
      const [ledger, cash, quotes] = await Promise.all([
        supabase.from("investment_ledger").select("id,account_id,sequence,kind,void_entry_id,symbol,occurred_on,quantity,price,fees,source,import_key,created_at", { count: "exact" }).eq("user_id", userId).eq("account_id", data.id).order("sequence").limit(5001),
        supabase.from("investment_cash_ledger").select("id,account_id,sequence,kind,void_entry_id,symbol,occurred_on,amount,tax,fees,source,import_key,created_at", { count: "exact" }).eq("user_id", userId).eq("account_id", data.id).order("sequence").limit(5001),
        supabase.from("investment_quotes").select("id,account_id,sequence,symbol,currency,price,as_of,source_kind,source,import_key,created_at", { count: "exact" }).eq("user_id", userId).eq("account_id", data.id).order("as_of", { ascending: false }).limit(5001),
      ]);
      if ([ledger, cash, quotes].some((result) => result.error || result.count === null || result.count !== (result.data?.length ?? 0) || (result.data?.length ?? 0) > 5000)) return unavailable;
      const checkedAt = new Date().toISOString();
      const daily = deriveInvestmentDaily([account], (ledger.data ?? []).map((row) => ({ ...row, kind: z.enum(["opening", "buy", "sell", "void"]).parse(row.kind) })), (cash.data ?? []).map((row) => ({ ...row, kind: z.enum(["opening", "deposit", "withdrawal", "dividend", "fee", "void"]).parse(row.kind) })), (quotes.data ?? []).map((row) => ({ ...row, currency: z.enum(["CNY", "USD", "HKD"]).parse(row.currency), source_kind: z.enum(["manual", "imported"]).parse(row.source_kind) })), account.mode, checkedAt)[0];
      const holdings = daily.holdings.flatMap((holding) => [field(`quantity:${holding.symbol}`, `${holding.symbol} 数量`, holding.quantity), field(`cost:${holding.symbol}`, `${holding.symbol} 剩余成本`, holding.costBasis), field(`realized:${holding.symbol}`, `${holding.symbol} 已实现盈亏`, holding.realizedPnl), field(`quote:${holding.symbol}`, `${holding.symbol} 报价截至`, holding.quote?.as_of), field(`source:${holding.symbol}`, `${holding.symbol} 报价来源`, holding.quote?.source)]);
      return base(data.name, `/investments?tab=holdings&mode=${data.mode}&item=${ref.id}`, [field("currency", "原币", account.currency), field("mode", "模式", account.mode === "paper" ? "模拟" : "实盘"), field("cash", "现金（原币）", daily.cash), field("marketValue", "已记录市值（原币）", daily.marketValue), field("assets", "已记录资产（原币）", daily.recordedAssets), field("missingQuotes", "缺少报价的持仓", daily.missingQuotes), field("staleQuotes", "报价较旧的持仓", daily.staleQuotes), ...holdings], { currency: account.currency, mode: account.mode, asOf: checkedAt, subtitle: "按完整已录入账本计算；报价不是实时行情" });
    }
    return missing;
  } catch { return unavailable; }
}
