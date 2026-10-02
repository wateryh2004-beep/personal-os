"use client";

import Link from "next/link";
import { acknowledgeLatencyFixtureMutation } from "./navigation-latency-actions";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TaskWorkspaceLoader } from "@/components/tasks/task-workspace-loader";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { NotesWorkspaceLoader } from "@/components/notes/notes-workspace-loader";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { WorkspacePanelProvider } from "@/components/layout/workspace-panel-provider";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
import { ActionFeedbackProvider } from "@/components/shared/action-feedback";
import { tasksWorkspaceResource } from "@/features/tasks/workspace-resource";
import { notesWorkspaceResource } from "@/features/notes/workspace-resource";
import { latencyTasks, latencyNotes } from "./navigation-latency-fixtures";

export function NavigationLatencyHarness({ workspace, mode, delay, revision }: { workspace: string; mode: string; delay: number; revision: string }) {
  return <WorkspaceIdentityBoundary ownerId="fixture-latency-owner" revision={revision}>
    <ActionFeedbackProvider><WorkspacePanelProvider><Harness workspace={workspace} mode={mode} delay={delay} /></WorkspacePanelProvider></ActionFeedbackProvider>
  </WorkspaceIdentityBoundary>;
}

function Harness({ workspace, mode, delay }: { workspace: string; mode: string; delay: number }) {
  const router = useRouter();
  const [warmed, setWarmed] = useState(false);
  const [draft, setDraft] = useState("");
  const href = (target: string) => `/mobile-native-e2e?scene=latency&mode=${mode}&delay=${delay}&workspace=${target}`;
  const warm = async () => { await Promise.all([tasksWorkspaceResource.prefetch(), notesWorkspaceResource.prefetch()]); setWarmed(true); };
  const start = (target: string) => {
    performance.mark("fixture-navigation-click");
    if (mode !== "baseline") void (target === "tasks" ? tasksWorkspaceResource : notesWorkspaceResource).prefetch();
  };
  return <main data-testid="latency-harness" data-workspace={workspace}>
    <nav className="flex gap-5 p-4">
      {["home", "tasks", "notes"].map((target) => <Link key={target} data-testid={`go-${target}`} href={href(target)} prefetch={false} onClick={() => { if (target !== "home") start(target); }}>{target}</Link>)}
      <button data-testid="prefetch-tasks" onClick={() => router.prefetch(href("tasks"))}>prefetch task route</button>
      <button data-testid="prefetch-notes" onClick={() => router.prefetch(href("notes"))}>prefetch note route</button>
      <button data-testid="warm" onClick={() => { void warm(); }}>{warmed ? "ready" : "warm cache"}</button>
    </nav>
    <input aria-label="Unfinished fixture draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    <form action={acknowledgeLatencyFixtureMutation}><button data-testid="commit-revision">Acknowledge fixture mutation</button></form>
    {workspace === "home" ? <h1>Navigation latency fixture</h1> : null}
    {workspace === "tasks" ? mode === "baseline"
      ? <TaskWorkspace lists={latencyTasks.lists} tasks={latencyTasks.tasks} initialDayBounds={{ startMs: 0, endMs: 8_640_000_000_000_000 }} initialTaskId="fixture-task" />
      : <TaskWorkspaceLoader initialDayBounds={{ startMs: 0, endMs: 8_640_000_000_000_000 }} initialTaskId="fixture-task" /> : null}
    {workspace === "notes" ? mode === "baseline"
      ? <NotesWorkspace notes={latencyNotes.notes} folders={latencyNotes.folders} timezone="UTC" state="ready" selectedFolder={null} initialView="all" dailyError={false} initialHasMore={false} />
      : <NotesWorkspaceLoader initialView="all" dailyError={false} /> : null}
  </main>;
}
