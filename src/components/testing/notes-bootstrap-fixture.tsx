"use client";
import { ActionFeedbackProvider } from "@/components/shared/action-feedback";
import Link from "next/link";
import { NotesRouteWorkspace } from "@/components/notes/notes-route-workspace";
import type { WorkspaceBootstrap } from "@/lib/workspace-resource-cache";
import { NotesWorkspaceLoader } from "@/components/notes/notes-workspace-loader";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
import { perfMark } from "@/lib/perf";
import type { NotesWorkspaceData } from "@/features/notes/workspace-resource";

export function NotesBootstrapFixture({mode,workspace,bootstrap}:{mode:string;workspace:string;bootstrap?:Promise<WorkspaceBootstrap<NotesWorkspaceData>>}) {
 const home=`/mobile-native-e2e?scene=notes-bootstrap&mode=${mode}&workspace=home`;
 const notes=`/mobile-native-e2e?scene=notes-bootstrap&mode=${mode}&workspace=notes`;
 return <WorkspaceIdentityBoundary ownerId="synthetic-bootstrap-owner" revision="synthetic-1"><ActionFeedbackProvider><main className="h-screen" data-testid="bootstrap-fixture">
 <nav className="flex gap-6 p-4"><Link prefetch={false} href={home} onClick={()=>perfMark("navigation-click")} data-testid="bootstrap-home">测试首页</Link><Link prefetch={false} href={notes} onClick={()=>perfMark("navigation-click")} data-testid="bootstrap-notes">打开笔记</Link></nav>
 {workspace==="home" ? <p className="p-6">合成导航首页 · 不连接真实数据库</p> : bootstrap ? <NotesRouteWorkspace initialView="all" dailyError={false} bootstrap={bootstrap} /> : <NotesWorkspaceLoader initialView="all" dailyError={false} />}
 </main></ActionFeedbackProvider></WorkspaceIdentityBoundary>;
}
