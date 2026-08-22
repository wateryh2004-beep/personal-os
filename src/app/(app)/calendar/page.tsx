import { CalendarWorkspaceLoader } from "@/components/calendar/calendar-workspace-loader";
import { getCalendarWorkspace } from "@/features/calendar/queries";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ create?: string; event?: string }> }) {
  const workspacePromise = getCalendarWorkspace();
  const [params, initialWorkspace] = await Promise.all([searchParams, workspacePromise]);
  return <CalendarWorkspaceLoader initialWorkspace={initialWorkspace} initialCreateOpen={params.create === "1"} initialEventId={params.event} />;
}
