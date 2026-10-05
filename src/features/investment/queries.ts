import "server-only";
import { requireOwner } from "@/lib/auth/require-owner";
import { investmentResearchSchema } from "./schemas";
import type { InvestmentWorkspaceData } from "./types";

export async function getInvestmentWorkspace(): Promise<InvestmentWorkspaceData> {
  const { supabase, userId } = await requireOwner();
  const [accounts, entries, strategies, research] = await Promise.all([
    supabase.from("investment_accounts").select("id,name,mode,currency,revision").eq("user_id", userId).is("archived_at", null).order("created_at").limit(101),
    supabase.from("investment_ledger").select("id,account_id,sequence,kind,void_entry_id,symbol,occurred_on,quantity,price,fees,source,import_key,created_at", { count: "exact" }).eq("user_id", userId).order("occurred_on").order("created_at").limit(5001),
    supabase.from("investment_strategy_versions").select("id,strategy_key,version,title,body_markdown,created_at").eq("user_id", userId).is("archived_at", null).order("created_at", { ascending: false }).limit(100),
    supabase.from("investment_research_runs").select("id,import_key,title,kind,body_markdown,as_of,source_urls,strategy_version_id,provenance,metrics,created_at").eq("user_id", userId).is("archived_at", null).order("created_at", { ascending: false }).limit(100),
  ]);
  // Never compute a convincing but incomplete portfolio from a truncated ledger.
  if ([accounts, entries, strategies, research].some((result) => result.error) || (accounts.data?.length ?? 0) > 100 || (entries.data?.length ?? 0) > 5000 || entries.count === null || entries.count !== (entries.data?.length ?? 0)) return { accounts: [], entries: [], strategies: [], research: [], unavailable: true };
  try {
    for (const row of research.data ?? []) investmentResearchSchema.parse({ schema_version: 1, import_key: row.import_key, title: row.title, kind: row.kind, body_markdown: row.body_markdown, as_of: row.as_of, source_urls: row.source_urls, strategy_version_id: row.strategy_version_id, provenance: row.provenance, metrics: row.metrics });
  } catch {
    // Defense in depth for older/mismatched schemas: JSON must be safe to render.
    return { accounts: [], entries: [], strategies: [], research: [], unavailable: true };
  }
  return { accounts: accounts.data ?? [], entries: entries.data ?? [], strategies: strategies.data ?? [], research: research.data ?? [], unavailable: false } as InvestmentWorkspaceData;
}
