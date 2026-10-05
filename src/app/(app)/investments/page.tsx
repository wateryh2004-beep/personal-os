import { InvestmentWorkspace } from "@/components/investment/investment-workspace";
import { parseInvestmentView } from "@/components/investment/presentation";
import { deriveHoldings } from "@/features/investment/calculator";
import { getInvestmentWorkspace } from "@/features/investment/queries";
import type { Holding } from "@/features/investment/types";
import { RESEARCH_IMPORT_EXAMPLE } from "@/features/investment/schemas";

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; mode?: string | string[] }> }) {
  const [data, params] = await Promise.all([getInvestmentWorkspace(), searchParams]);
  const { tab, mode } = parseInvestmentView(params);
  let holdings: Holding[] = [];
  let unavailable = data.unavailable;
  try {
    if (!unavailable) holdings = deriveHoldings(data.accounts, data.entries, mode);
  } catch {
    // Never render a plausible empty/zero portfolio from an invalid ledger.
    unavailable = true;
  }
  return <InvestmentWorkspace key={`${tab}:${mode}`} data={{ ...data, unavailable }} holdings={holdings} tab={tab} mode={mode} importExample={RESEARCH_IMPORT_EXAMPLE} />;
}
