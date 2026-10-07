"use client";
import { ActionFeedbackProvider } from "@/components/shared/action-feedback";
import Link from "next/link";
import { NotesWorkspaceLoader } from "@/components/notes/notes-workspace-loader";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
import { perfMark } from "@/lib/perf";
import type { NotesWorkspaceData } from "@/features/notes/workspace-resource";
export const notesBootstrapFixture: NotesWorkspaceData = {
 notes:[{id:"10000000-0000-4000-8000-000000000001",title:"流式首屏 · Synthetic notebook",excerpt:null,folder_id:null,updated_at:"2026-10-07T00:00:00Z",pinned_at:null,content_origin:"manual"}],
 folders:[],navigatorNotes:[],timezone:"UTC",state:"ready",hasMore:false,
};
export function NotesBootstrapFixture({mode,workspace,generatedAt}:{mode:string;workspace:string;generatedAt:number}) {
 const home=`/mobile-native-e2e?scene=notes-bootstrap&mode=${mode}&workspace=home`;
 const notes=`/mobile-native-e2e?scene=notes-bootstrap&mode=${mode}&workspace=notes`;
 return <WorkspaceIdentityBoundary ownerId="synthetic-bootstrap-owner" revision="synthetic-1"><ActionFeedbackProvider><main className="h-screen" data-testid="bootstrap-fixture">
 <nav className="flex gap-6 p-4"><Link prefetch={false} href={home} onClick={()=>perfMark("navigation-click")} data-testid="bootstrap-home">测试首页</Link><Link prefetch={false} href={notes} onClick={()=>perfMark("navigation-click")} data-testid="bootstrap-notes">打开笔记</Link></nav>
 {workspace==="home" ? <p className="p-6">合成导航首页 · 不连接真实数据库</p> : <NotesWorkspaceLoader initialView="all" dailyError={false} bootstrap={mode==="streamed" ? {ownerId:"synthetic-bootstrap-owner",generatedAt,data:notesBootstrapFixture}:undefined} />}
 </main></ActionFeedbackProvider></WorkspaceIdentityBoundary>;
}
