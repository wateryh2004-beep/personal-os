import { CalendarWorkspaceLoader } from "@/components/calendar/calendar-workspace-loader";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ create?: string; event?: string }> }) {
  const params = await searchParams;
  return <CalendarWorkspaceLoader initialCreateOpen={params.create === "1"} initialEventId={params.event} />;
}
