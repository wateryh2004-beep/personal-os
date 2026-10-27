"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { NoteDocumentShell } from "@/components/notes/note-document-shell";
import { NoteEditor } from "@/components/notes/note-editor";
import { PageHeader } from "@/components/shared/page-header";
import { useFixtureTextScale } from "./use-fixture-text-scale";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
import { navigationTransitionType } from "@/components/layout/navigation-motion";
import { workbenchReadInputSchema } from "@/features/workbench/contracts";

const folders = [
  { id: "20000000-0000-4000-8000-000000000001", name: "阅读与思考", parent_id: null },
  { id: "20000000-0000-4000-8000-000000000002", name: "工作与项目", parent_id: null },
  { id: "20000000-0000-4000-8000-000000000003", name: "每周回顾", parent_id: null },
];
const titles = ["把观察变成清晰的判断", "一次项目复盘的提纲", "阅读之后，留下自己的问题", "这一周值得继续的事"];
const notes = Array.from({ length: 32 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  title: index < 4 ? titles[index] : `阅读记录 ${String(index + 1).padStart(2, "0")}：从材料到判断`,
  excerpt: "先记录看到的事实，再写下自己的理解。把仍待核对的问题留给下一次阅读。",
  folder_id: folders[index % folders.length].id, updated_at: "2026-10-24T02:30:00Z", pinned_at: null, content_origin: "human",
}));
const body = "## 从一条观察开始\n\n好的笔记，让零散的材料逐渐形成自己的判断。这里的文字全部为合成内容，用于验证阅读、编辑和空间过渡。\n\n### 把事实和想法分开\n\n- 写下具体观察，保留来源。\n- 用自己的话解释原因。\n- 留下一两个仍然值得追问的问题。\n\n> 让页面保持安静，让内容成为主角。\n\n### 下一次继续\n\n重新打开这篇笔记时，应该能迅速接上思路。目录、正文和保存状态各自清晰，也能随时回到刚才浏览的位置。\n\n" + "\n\n## 材料与判断\n\n| 观察 | 判断 | 下一步 |\n| --- | --- | --- |\n| 内容来自合成资料 | 版式帮助阅读 | 继续核对来源 |\n\n```ts\nconst observation = { source: \"synthetic\", verified: false };\n```\n\n![合成资料缩略图](/api/files/e2e-file-1/thumbnail)\n\n";

function ImmediateNavigationProbe({ workspace }: { workspace: string }) {
  const [count, setCount] = useState(0);
  return <div data-navigation-probe={workspace} className="mt-6 flex flex-wrap items-center gap-3"><button type="button" className="ui-action-secondary min-h-11 px-3" onClick={() => setCount(value => value + 1)}>验证即时操作</button><output data-testid="navigation-immediate-count">{count}</output></div>;
}

/** Existing E2E gate only. Real components; all API traffic is synthetic and writes fail. */
export function WorkspaceMotionFixture() {
  const params = useSearchParams();
  useFixtureTextScale(params.get("textScale") === "200" ? "200" : undefined);
  const router = useRouter();
  useLayoutEffect(() => {
    if (params.has("workspace")) return;
    const canonical = new URL(window.location.href);
    canonical.searchParams.set("workspace", "notes");
    // Installed Next linking-and-navigating.md: native replaceState integrates
    // with App Router. Keep its state and one canonical list-return cache key.
    window.history.replaceState(window.history.state, "", `${canonical.pathname}${canonical.search}${canonical.hash}`);
  }, [params]);
  const activeId = params.get("document");
  const workspace = params.get("workspace") ?? "notes";
  const active = notes.find(note => note.id === activeId) ?? notes[0];
  const pathname = workspace === "notes" ? activeId ? `/notes/${active.id}` : "/notes" : `/${workspace}`;
  const go = (href: string) => {
    const target = new URL(href, window.location.origin);
    const next = new URLSearchParams(window.location.search);
    const documentId = /^\/notes\/([0-9a-f-]{36})$/i.exec(target.pathname)?.[1];
    next.set("workspace", target.pathname.startsWith("/notes") ? "notes" : target.pathname.split("/")[1] || "today");
    if (documentId) next.set("document", documentId); else next.delete("document");
    router.push(`/mobile-native-e2e?${next}`, { scroll: false, transitionTypes: [documentId ? "note-open" : activeId && target.pathname === "/notes" ? "note-return" : navigationTransitionType(pathname, target.pathname) ?? "workspace-switch"] });
  };
  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    const fixtureFetch: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (method !== "GET") return Response.json({ error: "合成验证场景不执行写入。" }, { status: 503 });
      if (!url.pathname.startsWith("/api/")) return originalFetch(input, init);
      const q = url.searchParams.get("q") ?? "";
      if (q.includes("失败")) return Response.json({ error: "搜索暂时不可用，请调整关键词后重试。" }, { status: 503 });
      const matching = notes.filter(note => note.title.includes(q));
      if (url.pathname === "/api/search") return Response.json({ results: matching.slice(0, 5).map(note => ({
        id: note.id, domain: "notes", entityType: "note", entityId: note.id, title: note.title, subtitle: "合成验证资料", snippet: note.excerpt, href: `/notes/${note.id}`, score: 1, sourceUpdatedAt: note.updated_at, metadata: {},
      })) });
      if (url.pathname === "/api/notes/search") return Response.json({ results: matching });
      if (url.pathname === "/api/notes/list") return Response.json({ notes, hasMore: false });
      if (url.pathname === "/api/notes/workspace") return Response.json({ notes, folders, navigatorNotes: notes, timezone: "Asia/Shanghai", state: "ready" });
      const documentId = /^\/api\/notes\/([0-9a-f-]{36})\/document$/.exec(url.pathname)?.[1];
      if (documentId) {
        const note = notes.find((item) => item.id === documentId);
        return Response.json(note ? { note: { ...note, user_id: "synthetic-motion-owner", body_markdown: body.repeat(3), revision: 1, last_saved_at: note.updated_at, created_at: note.updated_at, archived_at: null, deleted_at: null, status: "active", ai_visibility: "normal", source_url: null }, attachments: [] } : null);
      }
      if (url.pathname === "/api/workbench/entities") {
        let refs: unknown;
        try { refs = JSON.parse(url.searchParams.get("refs") ?? "null"); } catch { return Response.json({ error: "Invalid synthetic reference" }, { status: 400 }); }
        const parsed = workbenchReadInputSchema.safeParse({ refs });
        if (!parsed.success) return Response.json({ error: "Invalid synthetic reference" }, { status: 400 });
        return Response.json({ results: parsed.data.refs.map((ref) => { const note = ref.kind === "note" ? notes.find((item) => item.id === ref.id) : null; return note ? { status: "ready", entity: { ref, title: note.title, href: `/notes/${note.id}`, subtitle: "合成验证资料", fields: [], bodyMarkdown: body.repeat(3), sourceUrls: [], asOf: note.updated_at } } : { status: "missing", ref }; }) });
      }
      return Response.json({ error: "此验证场景不读取业务服务。" }, { status: 503 });
    };
    window.fetch = fixtureFetch;
    return () => { if (window.fetch === fixtureFetch) window.fetch = originalFetch; };
  }, []);
  useLayoutEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<{ href?: string; phase?: string }>).detail;
      const href = detail?.href;
      if (!href || event.defaultPrevented || detail?.phase === "prepare") return;
      event.preventDefault(); event.stopImmediatePropagation(); go(href);
    };
    window.addEventListener("personal-os:navigation-start", navigate, true);
    return () => window.removeEventListener("personal-os:navigation-start", navigate, true);
  });
  return <div data-testid="workspace-motion-fixture" onSubmitCapture={event => event.preventDefault()} onClickCapture={event => {
    const element = event.target instanceof Element ? event.target : null;
    const link = element?.closest<HTMLAnchorElement>('a[href^="/"]');
    const back = element?.closest('button[aria-label="返回笔记列表"]');
    if (!link && !back) return;
    // Search preview owns its Link.onNavigate so real mobile layer dismissal
    // happens before the shared navigation event maps to this synthetic route.
    if (link?.closest(".command-result-preview")) return;
    event.preventDefault();
    if (back) event.stopPropagation();
    go(back ? "/notes" : link!.getAttribute("href")!);
  }}>
    <WorkspaceIdentityBoundary ownerId="synthetic-motion-owner" revision="visual-motion-1"><AppShell presentationPathname={pathname}>
      {workspace === "notes" ? <NotesWorkspaceShell folders={folders} notes={notes} documentView={Boolean(activeId)}>
        {activeId ? <NoteDocumentShell key={active.id} noteId={active.id} location={{ href: "/notes", label: "阅读与思考" }}
          editor={<NoteEditor note={{ ...active, body_markdown: body.repeat(3), revision: 1, last_saved_at: active.updated_at, content_origin: "human" }} noteAiDefaultModel="deepseek-v4-flash" />}
          inspector={<p>仅用于验证的合成资料，不连接个人数据库。</p>} />
          : <NotesWorkspace notes={notes} folders={folders} timezone="Asia/Shanghai" state="ready" selectedFolder={null} initialView="all" dailyError={false} initialHasMore={false} />}
      </NotesWorkspaceShell> : <div className="py-4"><PageHeader title={workspace === "today" ? "今天" : workspace === "career" ? "职业中心" : "工作区"} description="合成导航场景，不包含个人资料。" /><p className="mt-8 text-[var(--text-secondary)]">从导航返回笔记，继续刚才的阅读。</p><ImmediateNavigationProbe key={workspace} workspace={workspace} /></div>}
    </AppShell></WorkspaceIdentityBoundary>
    <span className="sr-only">全部内容均为合成验证资料</span>
  </div>;
}
