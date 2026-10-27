"use client";
import { useDraftResumeOpeners } from "@/features/workflow-continuity/draft-resume";

import { Activity, useCallback, useEffect, useState, type ReactNode, type MouseEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ResumeCard } from "@/components/career/resume-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { getResumeVersions } from "@/features/career/queries";

type ResumeReadModel = Awaited<ReturnType<typeof getResumeVersions>>;
// Additive fields remain optional while an earlier server snapshot is mounted.
type ResumeData = Omit<ResumeReadModel,"materialChecks"|"materialsUnavailable"|"materialsTruncated"> & Partial<Pick<ResumeReadModel,"materialChecks"|"materialsUnavailable"|"materialsTruncated">>;

export function ResumeWorkspace({ data, createForm }: { data: ResumeData; createForm: ReactNode }) {
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const updateDirty = useCallback((id: string, dirty: boolean) => setDirtyIds(previous => dirty === previous.includes(id) ? previous : dirty ? [...previous, id] : previous.filter(value => value !== id)), []);
  useEffect(() => {
    if (!dirtyIds.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    const guardLink = (event: globalThis.MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target === "_blank" || link.download) return;
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname === "/career/resumes") return;
      if (!window.confirm("有未保存的简历修改。离开后将丢失这些修改，仍要离开吗？")) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guardLink, true); };
  }, [dirtyIds]);
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const direction = params.get("direction") ?? "all";
  const requestedId = params.get("resume");
  const documents = new Map(data.documents.map(document => [document.id, document]));
  const filtered = data.resumes.filter(resume => (status === "all" || resume.status === status) && (direction === "all" || (resume.target_direction_id ?? "general") === direction) && [resume.title, resume.version_label, data.directions.find(item => item.id === resume.target_direction_id)?.name].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  const selected = data.resumes.find(resume => resume.id === requestedId) ?? (!requestedId ? filtered[0] : undefined);
  const [visited, setVisited] = useState<string[]>(selected ? [selected.id] : []);
  // Keep visited form instances alive when selecting/filtering/backing out. No draft text is copied into browser storage.
  const mountedIds = new Set([...visited, ...(selected ? [selected.id] : [])]);
  const explicitDetail = Boolean(requestedId && selected);
  const activeFilters = Boolean(query || status !== "all" || direction !== "all");
  const makeUrl = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    return `/career/resumes${next.size ? `?${next}` : ""}`;
  };
  const navigate = (event: MouseEvent<HTMLAnchorElement>, id: string | null) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (selected && !visited.includes(selected.id)) setVisited(previous => [...previous, selected.id]);
    if (id) setVisited(previous => previous.includes(id) ? previous : [...previous, id]);
    window.history.pushState(null, "", makeUrl({ resume: id }));
    requestAnimationFrame(() => document.getElementById(id ? "resume-detail-heading" : "resume-list-heading")?.focus({ preventScroll: false }));
  };
  const filter = (key: string, value: string) => {
    if (selected) setVisited(previous => previous.includes(selected.id) ? previous : [...previous, selected.id]);
    window.history.replaceState(null, "", makeUrl({ [key]: value === "all" ? null : value, resume: null }));
  };

  const [createOpen,setCreateOpen]=useState(false);
  useDraftResumeOpeners([{kind:"career.resume-create",id:"new"},...data.resumes.flatMap(resume=>[{kind:"career.resume-content" as const,id:resume.id},{kind:"career.resume-bullets" as const,id:resume.id}])],target=>{if(target.kind==="career.resume-create"){setCreateOpen(true);return;}if(!data.resumes.some(resume=>resume.id===target.id))return false;setVisited(previous=>previous.includes(target.id)?previous:[...previous,target.id]);window.history.replaceState(null,"",makeUrl({resume:target.id}));});
  return <>
    {data.unavailable ? <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--surface-control)] p-4 text-sm text-[var(--danger)]">部分简历数据暂时不可用，列表或关联可能不完整。<button className="ui-link min-h-11" type="button" onClick={() => window.location.reload()}>重新加载</button></div> : null}
    <div className="mb-5 flex items-center justify-between gap-4"><p className="text-sm text-[var(--text-secondary)]">{data.resumes.length} 份版本</p><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger asChild><Button>新建简历版本</Button></DialogTrigger><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>新建简历版本</DialogTitle><DialogDescription>创建草稿，保留现有定稿与投递引用。</DialogDescription></DialogHeader>{createForm}</DialogContent></Dialog></div>
    <div className="grid items-start gap-7 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
      <section aria-labelledby="resume-list-heading" className={`${explicitDetail ? "hidden lg:block" : ""} min-w-0 lg:sticky lg:top-[calc(var(--toolbar-height)+1rem)]`}>
        <h2 id="resume-list-heading" tabIndex={-1} className="mb-4 text-base font-medium focus-visible:outline-2 focus-visible:outline-[var(--accent)]">版本列表</h2>
        <label className="grid gap-2 text-sm">搜索版本<input type="search" value={query} onChange={event => filter("q", event.target.value)} className="ui-field min-h-11 w-full rounded-lg px-3 text-base" placeholder="名称或方向" /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="grid gap-2 text-sm">状态<select className="ui-field min-h-11 min-w-0 rounded-lg px-2 text-base" value={status} onChange={event => filter("status", event.target.value)}><option value="all">全部状态</option><option value="draft">草稿</option><option value="approved">已定稿</option></select></label>
          <label className="grid gap-2 text-sm">方向<select className="ui-field min-h-11 min-w-0 rounded-lg px-2 text-base" value={direction} onChange={event => filter("direction", event.target.value)}><option value="all">全部方向</option><option value="general">通用</option>{data.directions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <div className="my-3 flex min-h-11 items-center justify-between gap-3 text-xs text-[var(--text-secondary)]"><span role="status">{filtered.length} 份结果{activeFilters ? " · 已筛选" : ""}</span>{activeFilters ? <button type="button" onClick={() => window.history.replaceState(null, "", makeUrl({ q: null, status: null, direction: null, resume: null }))} className="ui-link min-h-11">清除筛选</button> : null}</div>
        <nav aria-label="简历版本列表" className="space-y-2 lg:max-h-[calc(100dvh_-_var(--toolbar-height)_-_20rem)] lg:overflow-y-auto lg:overscroll-contain">
          {filtered.map(resume => <Link key={resume.id} href={makeUrl({ resume: resume.id })} onClick={event => navigate(event, resume.id)} aria-current={selected?.id === resume.id ? "true" : undefined} className={`ui-selectable-row block rounded-xl border-l-2 p-4 transition-colors ui-transition ${selected?.id === resume.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent bg-[var(--surface-canvas)] hover:bg-[var(--surface-hover)]"}`}><span className="block break-words text-[15px] font-medium leading-6">{resume.title}</span><span className="mt-2 block text-xs leading-5 text-[var(--text-secondary)]">{resume.status === "draft" ? "草稿" : "已定稿"} · {data.directions.find(item => item.id === resume.target_direction_id)?.name ?? (resume.target_direction_id ? "方向暂不可用" : "通用")}</span><span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{resume.document_id ? documents.has(resume.document_id) ? "已关联原件" : "关联原件暂不可用" : "未关联原件"} · {data.applications.filter(item => item.resume_version_id === resume.id).length} 次申请引用</span><span className="mt-1 block text-xs tabular-nums text-[var(--text-secondary)]">更新于 {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium" }).format(new Date(resume.updated_at))}</span></Link>)}
        </nav>
        {!filtered.length ? <p className="py-8 text-sm leading-7 text-[var(--text-secondary)]">{data.resumes.length ? "没有匹配的版本，可调整关键词或清除筛选。" : "还没有简历版本，可先创建草稿。"}</p> : null}
      </section>
      <section aria-label="简历版本详情" className={`${explicitDetail ? "" : "hidden lg:block"} min-w-0 rounded-[20px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-7`}>
        <Link href={makeUrl({ resume: null })} onClick={event => navigate(event, null)} className="ui-link mb-4 inline-flex min-h-11 items-center text-sm lg:hidden">返回版本列表</Link>
        <h2 id="resume-detail-heading" tabIndex={-1} className="mb-5 break-words font-[family-name:var(--font-serif)] text-2xl leading-snug focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{selected?.title ?? "选择简历版本"}</h2>
        {selected?<section className="mb-4 text-sm"><h3 className="font-medium">这份简历对应的机会材料</h3>{data.materialsUnavailable?<p role="status">关联核对单暂时无法读取。</p>:<ul>{[...new Set((data.materialChecks??[]).filter(check=>check.resume_version_id===selected.id).map(check=>check.opportunity_id))].map(id=><li key={id}><Link className="ui-link inline-flex min-h-11 items-center" href={`/career/opportunities/${id}/materials`}>打开已关联机会的材料核对单</Link></li>)}</ul>}<Link className="ui-link inline-flex min-h-11 items-center" href="/career/opportunities">选择其他机会，关联这份简历</Link>{data.materialsTruncated?<p>关联来自最近500项材料记录。</p>:null}</section>:null}
        {selected && !filtered.some(item => item.id === selected.id) ? <p className="mb-4 text-sm text-[var(--text-secondary)]">当前版本不在筛选结果中。可返回列表调整筛选。</p> : null}
        {data.resumes.filter(resume => mountedIds.has(resume.id)).map(resume => <Activity key={resume.id} mode={resume.id === selected?.id ? "visible" : "hidden"}><ResumeCard showTitle={false} onDirtyChange={dirty => updateDirty(resume.id, dirty)} resume={resume} directions={data.directions} documents={data.documents} linkedDocument={resume.document_id ? documents.get(resume.document_id) : undefined} bullets={data.bullets} selectedBulletIds={new Set(data.links.filter(link => link.resume_version_id === resume.id).map(link => link.bullet_id))} usage={data.applications.filter(item => item.resume_version_id === resume.id).length} /></Activity>)}
        {!selected ? <p className="text-sm leading-7 text-[var(--text-secondary)]">{requestedId ? "这个版本不可用或已归档，请返回版本列表。" : "从左侧选择一份版本查看内容。"}</p> : null}
      </section>
    </div>
  </>;
}
