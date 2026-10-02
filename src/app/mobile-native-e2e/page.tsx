import { notFound } from "next/navigation";
import { MobileNativeHarness } from "@/components/testing/mobile-native-harness";
import { WorkspacePolishHarness, type PolishScene } from "@/components/testing/workspace-polish-harness";

export const dynamic = "force-dynamic";

export default async function MobileNativeE2EPage({ searchParams }: { searchParams: Promise<{ scene?: string }> }) {
  if (process.env.E2E_MOBILE_HARNESS !== "1") notFound();
  const { scene } = await searchParams;
  if (scene && ["today", "tasks", "calendar", "notes", "today-loading", "tasks-loading", "calendar-loading"].includes(scene)) {
    return <WorkspacePolishHarness scene={scene as PolishScene} />;
  }
  return <MobileNativeHarness />;
}
