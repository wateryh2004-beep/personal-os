import { InterviewInsightsView } from "@/components/career/interview/interview-insights-view";
import { getInterviewInsights } from "@/features/interview/queries";

export default async function InterviewInsightsPage({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const { context } = await searchParams;
  const data = await getInterviewInsights(context ?? null);
  return <InterviewInsightsView data={data} context={context} />;
}
