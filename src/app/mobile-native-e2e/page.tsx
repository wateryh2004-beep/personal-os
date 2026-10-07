import { NotesBootstrapFixture } from "@/components/testing/notes-bootstrap-fixture";
import { R2StorageSettings } from "@/components/settings/r2-storage-settings";
import { NotesFolderFixture } from "@/components/testing/notes-folder-fixture";
import { TodayHierarchyFixture } from "@/components/testing/today-hierarchy-fixture";
import { InterviewReadingFixture } from "@/components/testing/interview-reading-fixture";
import { LeisureFixture } from "@/components/testing/leisure-fixture";
import { NotesSearchFixture } from "@/components/testing/notes-search-fixture";
import { cookies } from "next/headers";
import { workspaceRevisionCookie } from "@/lib/workspace-revalidation";
import { NavigationLatencyHarness } from "@/components/testing/navigation-latency-harness";
import { notFound } from "next/navigation";
import { MobileNativeHarness } from "@/components/testing/mobile-native-harness";
import { WorkspacePolishHarness, type PolishScene } from "@/components/testing/workspace-polish-harness";

export const dynamic = "force-dynamic";

export default async function MobileNativeE2EPage({ searchParams }: { searchParams: Promise<{ scene?: string; workspace?: string; mode?: string; delay?: string; item?: string }> }) {
  if (process.env.E2E_MOBILE_HARNESS !== "1") notFound();
  const { scene, workspace, mode, item, delay: rawDelay } = await searchParams;
  if (scene === "notes-bootstrap") {
    if (mode === "streamed" && workspace !== "home") await new Promise(resolve => setTimeout(resolve, 150));
    // Request-time timestamp on a dynamic synthetic server route.
    // eslint-disable-next-line react-hooks/purity
    return <NotesBootstrapFixture mode={mode ?? "streamed"} workspace={workspace ?? "notes"} generatedAt={Date.now()} />;
  }
  if (scene === "storage-settings") return <main className="mx-auto max-w-5xl p-4 sm:p-6"><h1 className="mb-5 text-2xl font-semibold">存储设置 · Synthetic fixture</h1><R2StorageSettings /></main>;
  if (scene === "today-hierarchy") return <TodayHierarchyFixture mode={mode} />;
  if (scene === "interview-reading") return <InterviewReadingFixture />;
  if (scene === "leisure") return <LeisureFixture item={item} mode={mode} />;
  if (scene === "notes-folders") return <NotesFolderFixture />;
  if (scene === "notes-search") return <NotesSearchFixture />;
  if (scene === "latency") {
    const delay = Math.min(1500, Math.max(0, Number(rawDelay) || 0));
    // Explicit synthetic baseline mirrors the former data-before-loader gate.
    // This route remains unavailable without E2E_MOBILE_HARNESS.
    if (mode === "baseline" && workspace !== "home") await new Promise((resolve) => setTimeout(resolve, delay));
    return <NavigationLatencyHarness workspace={workspace ?? "home"} mode={mode ?? "resource"} delay={delay} revision={(await cookies()).get(workspaceRevisionCookie)?.value ?? "fixture-v1"} />;
  }
  if (scene && ["projects", "calendar-edit", "heading", "career", "career-filled", "today", "today-filled", "tasks", "calendar", "notes", "note-editor", "note-pdf", "files", "files-cached-covers", "today-loading", "tasks-loading", "calendar-loading"].includes(scene)) {
    return <WorkspacePolishHarness scene={scene as PolishScene} />;
  }
  return <MobileNativeHarness />;
}
