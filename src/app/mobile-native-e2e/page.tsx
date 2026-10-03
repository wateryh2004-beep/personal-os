import { cookies } from "next/headers";
import { workspaceRevisionCookie } from "@/lib/workspace-revalidation";
import { NavigationLatencyHarness } from "@/components/testing/navigation-latency-harness";
import { notFound } from "next/navigation";
import { MobileNativeHarness } from "@/components/testing/mobile-native-harness";
import { WorkspacePolishHarness, type PolishScene } from "@/components/testing/workspace-polish-harness";

export const dynamic = "force-dynamic";

export default async function MobileNativeE2EPage({ searchParams }: { searchParams: Promise<{ scene?: string; workspace?: string; mode?: string; delay?: string }> }) {
  if (process.env.E2E_MOBILE_HARNESS !== "1") notFound();
  const { scene, workspace, mode, delay: rawDelay } = await searchParams;
  if (scene === "latency") {
    const delay = Math.min(1500, Math.max(0, Number(rawDelay) || 0));
    // Explicit synthetic baseline mirrors the former data-before-loader gate.
    // This route remains unavailable without E2E_MOBILE_HARNESS.
    if (mode === "baseline" && workspace !== "home") await new Promise((resolve) => setTimeout(resolve, delay));
    return <NavigationLatencyHarness workspace={workspace ?? "home"} mode={mode ?? "resource"} delay={delay} revision={(await cookies()).get(workspaceRevisionCookie)?.value ?? "fixture-v1"} />;
  }
  if (scene && ["heading", "career", "career-filled", "today", "today-filled", "tasks", "calendar", "notes", "note-editor", "note-pdf", "files", "today-loading", "tasks-loading", "calendar-loading"].includes(scene)) {
    return <WorkspacePolishHarness scene={scene as PolishScene} />;
  }
  return <MobileNativeHarness />;
}
