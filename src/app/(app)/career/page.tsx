import { Suspense } from "react";
import { CareerCapitalSummary } from "@/components/career/career-capital-summary";
import { CareerHomeView } from "@/components/career/career-home-view";
import { WorkspaceReadyMetric } from "@/components/performance/workspace-ready-metric";
import { getCareerHome } from "@/features/career/queries";

export default async function CareerPage() {
  const data = await getCareerHome();
  return <><WorkspaceReadyMetric workspace="career" /><CareerHomeView data={data} /><div id="capital" className="scroll-mt-20"><Suspense fallback={<p className="mt-6 text-sm text-[var(--text-tertiary)]">正在读取职业资本…</p>}><CareerCapitalSummary /></Suspense></div></>;
}
