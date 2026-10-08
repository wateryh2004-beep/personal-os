import "server-only";
import { requireOwner } from "@/lib/auth/require-owner";
import { investmentResearchSchema, investmentStrategySchema } from "./schemas";
import type { InvestmentTab, ResearchRun, StrategyVersion } from "./types";

/** An owned, unarchived deep link may be older than the recent-list window. */
export async function getInvestmentLinkedRecord(tab: InvestmentTab, item: string): Promise<{ strategy?: StrategyVersion; research?: ResearchRun }> {
  if (tab === "holdings") return {};
  const { supabase, userId } = await requireOwner();
  const strategy = tab === "strategies";
  const { data, error } = await supabase.from(strategy ? "investment_strategy_versions" : "investment_research_runs")
    .select(strategy ? "id,strategy_key,version,title,body_markdown,created_at" : "id,import_key,title,kind,body_markdown,as_of,source_urls,strategy_version_id,provenance,metrics,created_at")
    .eq("id", item).eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (error || !data) return {};
  try {
    if (strategy) {
      const row = data as unknown as StrategyVersion;
      investmentStrategySchema.parse({ strategy_key: row.strategy_key, title: row.title, body_markdown: row.body_markdown });
      return { strategy: row };
    }
    const row = data as unknown as ResearchRun;
    investmentResearchSchema.parse({ schema_version: 1, import_key: row.import_key, title: row.title, kind: row.kind, body_markdown: row.body_markdown, as_of: row.as_of, source_urls: row.source_urls, strategy_version_id: row.strategy_version_id, provenance: row.provenance, metrics: row.metrics });
    return { research: row };
  } catch { return {}; }
}
