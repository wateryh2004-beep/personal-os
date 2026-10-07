import { InvestmentWorkspace } from "@/components/investment/investment-workspace";
import { parseInvestmentView, parseInvestmentItem } from "@/components/investment/presentation";
import { getInvestmentLinkedRecord } from "@/features/investment/linked-record";
import { hasCompleteInvestmentDailySnapshot } from "@/features/investment/daily-snapshot";
import { getInvestmentDailyData } from "@/features/investment/daily-queries";
import { deriveHoldings } from "@/features/investment/calculator";
import { getInvestmentWorkspace } from "@/features/investment/queries";
import type { Holding } from "@/features/investment/types";
import { RESEARCH_IMPORT_EXAMPLE } from "@/features/investment/schemas";

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; mode?: string | string[]; item?: string | string[] }> }) {
  const params = await searchParams;
  const { tab, mode } = parseInvestmentView(params);
  const [data, dailyData] = await Promise.all([getInvestmentWorkspace(), tab === "holdings" ? getInvestmentDailyData() : Promise.resolve(undefined)]);
  if (dailyData && !dailyData.unavailable && !hasCompleteInvestmentDailySnapshot(data.accounts, data.entries, dailyData)) dailyData.unavailable = true;
  const selectedItem = parseInvestmentItem(params.item);
  if (!data.unavailable && selectedItem && tab !== "holdings" && !(tab === "strategies" ? data.strategies : data.research).some((row) => row.id === selectedItem)) {
    const linked = await getInvestmentLinkedRecord(tab, selectedItem);
    if (linked.strategy) data.strategies = [linked.strategy, ...data.strategies];
    if (linked.research) data.research = [linked.research, ...data.research];
  }
  let holdings: Holding[] = [];
  let unavailable = data.unavailable;
  try {
    if (!unavailable) holdings = deriveHoldings(data.accounts, data.entries, mode);
  } catch {
    // Never render a plausible empty/zero portfolio from an invalid ledger.
    unavailable = true;
  }
  return <InvestmentWorkspace key={`${tab}:${mode}`} data={{ ...data, unavailable }} dailyData={dailyData} selectedItem={selectedItem} holdings={holdings} tab={tab} mode={mode} importExample={RESEARCH_IMPORT_EXAMPLE} />;
}
