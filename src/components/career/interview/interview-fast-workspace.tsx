"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveWorkspaceSession } from "@/lib/workspace-session";
import { CAREER_CONTINUE_KEY } from "@/components/career/career-continue";
import { questionTypeLabels } from "@/features/interview/constants";
import { emptyLibraryFilters, filterWorkspaceItems, normalizeLibraryFilters, workspaceDomain, workspaceUrl, type LibraryFilters, type WorkspaceItem, type WorkspaceSearchIndex } from "@/features/interview/workspace-library";
import { InterviewStudyView } from "./interview-study-view";

type Target = { id: string; title: string; organization: string | null; role: string | null };
const ALL_CATEGORIES = ["resume", "behavioral", "motivation_fit", "knowledge", "business_case", "situational", "candidate_question"];
const categoryShortLabels: Record<string, string> = { ...questionTypeLabels, motivation_fit: "动机", knowledge: "专业", business_case: "商业案例" };

export function InterviewFastWorkspace({ targets, items, initialContextId, initialQuestionId, initialCategory, initialQuery = "", initialDomain = "all", initialStyle = "all", unavailable = false }: {
  targets: Target[];
  items: WorkspaceItem[];
  initialContextId: string;
  initialQuestionId: string;
  initialCategory: string;
  initialQuery?: string;
  initialDomain?: string;
  initialStyle?: string;
  unavailable?: boolean;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [searchIndex] = useState<WorkspaceSearchIndex>(() => new WeakMap());
  const [{ initialItem, initialFilters, conflictingFilters }] = useState(() => {
    const requestedFilters = normalizeLibraryFilters({ category: initialCategory, q: initialQuery, domain: initialDomain, style: initialStyle });
    const scoped = items.filter((item) => initialContextId ? item.contextId === initialContextId : item.contextId === null);
    const requested = scoped.find((item) => item.questionId === initialQuestionId);
    const conflictingFilters = Boolean(requested && !filterWorkspaceItems([requested], requestedFilters, searchIndex).length);
    const initialFilters = conflictingFilters ? emptyLibraryFilters : requestedFilters;
    return { initialItem: requested ?? filterWorkspaceItems(scoped, initialFilters, searchIndex)[0] ?? null, initialFilters, conflictingFilters };
  });
  const [filters, setFilters] = useState(initialFilters);
  const [contextId, setContextId] = useState(initialContextId);
  const [questionId, setQuestionId] = useState(initialItem?.questionId ?? "");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(initialQuestionId && initialItem?.questionId === initialQuestionId));
  const detailRef = useRef<HTMLElement | null>(null);
  const listScrollRef = useRef(0);
  const previousDetailOpenRef = useRef(mobileDetailOpen);
  const contextItems = useMemo(() => items.filter((item) => contextId ? item.contextId === contextId : item.contextId === null), [contextId, items]);
  const domains = useMemo(() => [...new Set(contextItems.map(workspaceDomain))].sort((a, b) => a.localeCompare(b, "zh-CN")), [contextItems]);
  const { category, domain, style, q } = filters;
  const matchingItems = useMemo(() => filterWorkspaceItems(contextItems, { category: "all", domain, style, q }, searchIndex), [contextItems, domain, style, q, searchIndex]);
  const counts = useMemo(() => {
    const next: Record<string, number> = { all: matchingItems.length };
    for (const item of matchingItems) next[item.category] = (next[item.category] ?? 0) + 1;
    return next;
  }, [matchingItems]);
  const visibleItems = useMemo(() => category === "all" ? matchingItems : matchingItems.filter((item) => item.category === category), [category, matchingItems]);
  const selected = contextItems.find((item) => item.questionId === questionId) ?? null;
  const relatedItems = useMemo(() => selected ? contextItems.filter((item) => item.parentQuestionId === selected.questionId || (selected.parentQuestionId && item.questionId === selected.parentQuestionId)) : [], [contextItems, selected]);
  const detailParams = new URLSearchParams();
  if (contextId) detailParams.set("context", contextId);
  if (selected?.answerId) detailParams.set("answer", selected.answerId);
  const detailHref = selected ? `/career/interview/questions/${selected.questionId}${detailParams.size ? `?${detailParams}` : ""}` : "";

  const replaceUrl = useCallback((nextContextId: string, nextQuestionId: string, nextFilters: LibraryFilters, answerId?: string | null) => {
    window.history.replaceState(window.history.state, "", workspaceUrl(nextContextId, nextQuestionId, nextFilters, answerId));
  }, []);

  useEffect(() => {
    if (conflictingFilters) replaceUrl(initialContextId, initialQuestionId, emptyLibraryFilters, initialItem?.answerId);
    // Canonicalize only the server-provided entry point; later history is restored below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContextChange = (nextContextId: string) => {
    const scoped = items.filter((item) => nextContextId ? item.contextId === nextContextId : item.contextId === null);
    setContextId(nextContextId);
    setQuestionId(scoped[0]?.questionId ?? "");
    setFilters(emptyLibraryFilters);
    setMobileDetailOpen(false);
    replaceUrl(nextContextId, "", emptyLibraryFilters);
  };
  const handleFiltersChange = (patch: Partial<LibraryFilters>) => {
    const next = normalizeLibraryFilters({ ...filters, ...patch });
    const visible = filterWorkspaceItems(contextItems, next, searchIndex);
    setFilters(next);
    setQuestionId(visible.find((item) => item.questionId === questionId)?.questionId ?? visible[0]?.questionId ?? "");
    setMobileDetailOpen(false);
    replaceUrl(contextId, "", next);
  };
  const handleQuestionChange = useCallback((nextQuestionId: string) => {
    const nextItem = contextItems.find((item) => item.questionId === nextQuestionId);
    if (!nextItem) return;
    const nextFilters = filterWorkspaceItems([nextItem], filters, searchIndex).length ? filters : emptyLibraryFilters;
    setFilters(nextFilters);
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (mobile && !mobileDetailOpen) {
      listScrollRef.current = window.scrollY;
      replaceUrl(contextId, "", nextFilters);
      window.history.pushState({ ...window.history.state, interviewDetail: true }, "", workspaceUrl(contextId, nextQuestionId, nextFilters, nextItem.answerId));
    } else replaceUrl(contextId, nextQuestionId, nextFilters, nextItem.answerId);
    setQuestionId(nextQuestionId);
    setMobileDetailOpen(true);
  }, [contextItems, filters, searchIndex, mobileDetailOpen, contextId, replaceUrl]);
  const closeMobileDetail = () => {
    if (window.history.state?.interviewDetail) window.history.back();
    else {
      setMobileDetailOpen(false);
      replaceUrl(contextId, "", filters);
    }
  };

  useEffect(() => {
    const restoreHistory = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedContext = params.get("context") ?? "";
      const nextContext = targets.some((target) => target.id === requestedContext) ? requestedContext : "";
      const requestedFilters = normalizeLibraryFilters({ category: params.get("category") ?? "all", domain: params.get("domain") ?? "all", style: params.get("style") ?? "all", q: params.get("q") ?? "" });
      const scoped = items.filter((item) => nextContext ? item.contextId === nextContext : item.contextId === null);
      const matched = scoped.find((item) => item.questionId === params.get("question"));
      const nextFilters = matched && !filterWorkspaceItems([matched], requestedFilters, searchIndex).length ? emptyLibraryFilters : requestedFilters;
      setContextId(nextContext);
      setFilters(nextFilters);
      setQuestionId(matched?.questionId ?? filterWorkspaceItems(scoped, nextFilters, searchIndex)[0]?.questionId ?? "");
      setMobileDetailOpen(Boolean(matched));
      if (matched && nextFilters !== requestedFilters) replaceUrl(nextContext, matched.questionId, nextFilters, matched.answerId);
      // A different pinned version must come from the authenticated server snapshot.
      if (matched && params.get("answer") && params.get("answer") !== matched.answerId) startRefresh(() => router.refresh());
    };
    window.addEventListener("popstate", restoreHistory);
    return () => window.removeEventListener("popstate", restoreHistory);
  }, [items, targets, searchIndex, replaceUrl, router]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      if (mobileDetailOpen) {
        detailRef.current?.scrollIntoView({ block: "start" });
        detailRef.current?.focus({ preventScroll: true });
      } else if (previousDetailOpenRef.current) window.scrollTo({ top: listScrollRef.current, behavior: "instant" });
    }
    previousDetailOpenRef.current = mobileDetailOpen;
  }, [mobileDetailOpen, questionId]);

  useEffect(() => {
    if (selected) saveWorkspaceSession(CAREER_CONTINUE_KEY, { href: workspaceUrl(contextId, selected.questionId, filters, selected.answerId), label: selected.shortTitle || selected.prompt });
  }, [selected, contextId, filters]);

  return (
    <div className="interview-workspace -mx-2 sm:-mx-3">
      <div className="px-2 sm:px-3">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2.5">
          <div className="flex min-w-0 max-w-full items-center gap-2.5">
            <Link href="/career" prefetch className="pressable inline-flex min-h-11 items-center rounded-[8px] px-1 py-0.5 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">← 目标岗位</Link>
            <select
              aria-label="面试岗位"
              value={contextId}
              onChange={(event) => handleContextChange(event.target.value)}
              className="min-h-11 min-w-0 max-w-[min(320px,65vw)] rounded-[9px] bg-[var(--surface-control)] px-2.5 py-1.5 text-[13px] font-medium tracking-[-0.006em] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
            >
              <option value="">通用面试</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.organization ? target.organization + " · " : ""}{target.role || target.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <Link href="/career/materials" className="pressable inline-flex min-h-11 items-center rounded-[8px] px-2 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">我的材料</Link>
            <Link href={`/career/interview/practice?context=${encodeURIComponent(contextId || "general")}`} className="pressable inline-flex min-h-11 items-center rounded-[8px] px-2 py-1 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">练习</Link>
            <Link href={`/career/interview/insights?context=${encodeURIComponent(contextId || "general")}`} className="pressable inline-flex min-h-11 items-center rounded-[8px] px-2 py-1 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">复盘</Link>

          </div>
        </div>

        <div className={`${mobileDetailOpen ? "hidden md:block" : ""} mt-5 border-b border-[var(--separator)] pb-4`}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div><h1 className="text-xl font-semibold leading-[1.3] tracking-[-0.015em]">面试学习</h1><p className="mt-1 text-[12px] leading-6 text-[var(--text-tertiary)]">阅读 AI 整理的内容，用练习检验理解</p></div>
            <span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">{contextItems.length} 道题</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(130px,220px)_130px]">
            <label className="col-span-2 grid gap-1 text-[12px] text-[var(--text-tertiary)] sm:col-span-1">搜索题库<input type="search" aria-label="搜索题库" value={filters.q} onChange={(event) => handleFiltersChange({ q: event.target.value })} placeholder="题目、概念、思路或答案" className="min-h-11 w-full min-w-0 rounded-[9px] bg-[var(--surface-control)] px-3 text-[14px] text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" /></label>
            <label className="grid gap-1 text-[12px] text-[var(--text-tertiary)]">学习模块<select aria-label="学习模块" value={filters.domain} onChange={(event) => handleFiltersChange({ domain: event.target.value })} className="min-h-11 w-full min-w-0 rounded-[9px] bg-[var(--surface-control)] px-2 text-[13px] text-[var(--text-primary)]"><option value="all">全部模块</option>{filters.domain !== "all" && !domains.includes(filters.domain) ? <option value={filters.domain}>{filters.domain}</option> : null}{domains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</select></label>
            <label className="grid gap-1 text-[12px] text-[var(--text-tertiary)]">提问风格<select aria-label="提问风格" value={filters.style} onChange={(event) => handleFiltersChange({ style: event.target.value })} className="min-h-11 rounded-[9px] bg-[var(--surface-control)] px-2 text-[13px] text-[var(--text-primary)]"><option value="all">全部风格</option><option value="standard">标准提问</option><option value="stress">压力追问</option></select></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="问题类型筛选">
            <CategoryButton label="全部题型" count={counts.all ?? 0} active={category === "all"} onClick={() => handleFiltersChange({ category: "all" })} />
            {ALL_CATEGORIES.map((key) => <CategoryButton key={key} label={categoryShortLabels[key]} count={counts[key] ?? 0} active={category === key} onClick={() => handleFiltersChange({ category: key })} />)}
          </div>
        </div>
        {unavailable ? <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-[9px] bg-[var(--surface-control)] p-3 text-[13px] text-[var(--danger)]">部分题库数据加载失败，当前结果可能不完整。<button type="button" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing} className="min-h-8 underline">{refreshing ? "重新加载中…" : "重新加载"}</button></div> : null}
      </div>

      <div className="mt-4 grid min-h-[680px] gap-5 md:grid-cols-[286px_minmax(0,1fr)] md:gap-8">
        <aside data-testid="interview-question-list" className={`${mobileDetailOpen ? "hidden md:block" : ""} min-h-0 self-start md:sticky md:top-[calc(var(--toolbar-height)+1rem)] rounded-[16px] bg-[color-mix(in_srgb,var(--surface-control)_48%,transparent)] p-2.5 ring-1 ring-inset ring-black/[0.022]`}>
          <div className="mb-1.5 flex items-center justify-between px-2">
            <span className="text-[12px] font-medium text-[var(--text-tertiary)]">{category === "all" ? "全部问题" : questionTypeLabels[category] ?? "问题"}</span>
            <span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">{visibleItems.length} / {contextItems.length}</span>
          </div>

          <nav aria-label="面试题目" className="space-y-px pr-0.5 md:max-h-[min(600px,calc(100dvh_-_var(--toolbar-height)_-_5rem))] md:overflow-y-auto">
            <QuestionOptions items={visibleItems} questionId={questionId} onSelect={handleQuestionChange} />
            {!visibleItems.length ? <div className="px-2 py-5 text-[13px] leading-6 text-[var(--text-tertiary)]"><p>{contextItems.length ? "没有找到匹配的问题" : "这个题库还没有问题"}</p><p className="text-xs">{contextItems.length ? "试试其他关键词，或清除筛选。" : "AI 整理的题目会在这里显示，也可以切换面试目标。"}</p>{contextItems.length ? <button type="button" onClick={() => handleFiltersChange(emptyLibraryFilters)} className="mt-2 min-h-11 text-[var(--accent)]">清除筛选</button> : null}</div> : null}
          </nav>
        </aside>

        <main ref={detailRef} tabIndex={-1} aria-label="面试题目详情" data-testid="interview-question-detail" className={`${mobileDetailOpen ? "block" : "hidden md:block"} min-w-0 scroll-mt-4 px-2 py-3.5 outline-none sm:px-3 md:px-0 md:py-4.5`}>
          <button type="button" onClick={closeMobileDetail} className="mb-4 min-h-11 rounded-[9px] px-3 text-[13px] font-medium text-[var(--accent)] md:hidden">← 返回题目列表</button>
          {selected ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3 md:flex-nowrap md:gap-5">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-tertiary)]">
                    <span>{workspaceDomain(selected)}</span><span>· {selected.categoryLabel}</span>
                    {selected.style === "stress" ? <span>· 压力</span> : null}
                    {selected.competencies.slice(0, 2).map((competency) => <span key={competency.key}>· {competency.label}</span>)}
                  </div>
                  <h1 className="max-w-3xl text-[23px] font-semibold leading-[1.42] tracking-[-0.015em] text-[var(--text-primary)]">{selected.prompt}</h1>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[12px] leading-6 text-[var(--text-tertiary)]">{selected.answerMeta ? `${selected.answerMeta.language === "en" ? "英文" : selected.answerMeta.language === "bilingual" ? "中英双语" : "中文"} · V${selected.answerMeta.version_number}` : "学习笔记"}</span>
                <Link href={`/career/interview/practice/${selected.preparationId}`} className="inline-flex min-h-11 items-center rounded-[9px] bg-[var(--accent)] px-4 text-[12px] font-medium text-white">练习这道题 →</Link>
              </div>
              <InterviewStudyView key={selected.preparationId} thoughts={selected.thoughts} answer={selected.answer} isDraft={selected.answerMeta?.status === "draft"} learning={selected.learning} related={relatedItems} onSelect={handleQuestionChange} answerMeta={selected.answerMeta} versionHref={`${detailHref}#answer-versions`} />
            </div>
          ) : (
            <div className="grid min-h-[520px] place-items-center px-8 text-center text-[13px] leading-6 text-[var(--text-tertiary)]">
              {contextItems.length ? "没有匹配的问题。调整关键词或清除筛选，继续学习。" : contextId ? "这个岗位还没有面试题。" : "通用题库还没有内容。AI 整理完成后，会在这里显示。"}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const QuestionOptions = memo(function QuestionOptions({ items, questionId, onSelect }: {
  items: WorkspaceItem[];
  questionId: string;
  onSelect: (questionId: string) => void;
}) {
  return items.map((item) => <QuestionOption key={item.preparationId} item={item} active={item.questionId === questionId} onSelect={onSelect} />);
});

const QuestionOption = memo(function QuestionOption({ item, active, onSelect }: {
  item: WorkspaceItem;
  active: boolean;
  onSelect: (questionId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.questionId)}
      aria-label={item.prompt}
      aria-current={active ? "true" : undefined}
      className={`pressable block w-full rounded-[9px] px-2.5 py-2.5 text-left text-[13px] leading-[1.45] ${active ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-white/55 hover:text-[var(--text-primary)]"}`}
    >
      <span className="line-clamp-2">{item.shortTitle || item.prompt}</span>
      <span className="mt-1 block truncate text-[12px] font-normal text-[var(--text-tertiary)]">{workspaceDomain(item)} · {item.categoryLabel}</span>
    </button>
  );
});

function CategoryButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`pressable inline-flex min-h-9 items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] font-medium ${active ? "bg-[var(--text-primary)] text-white shadow-[var(--shadow-control)]" : "bg-[var(--surface-control)] text-[var(--text-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--text-primary)]"}`}
    >
      <span>{label}</span>
      <span className={`text-[10px] tabular-nums ${active ? "text-white/60" : "text-[var(--text-tertiary)]"}`}>{count}</span>
    </button>
  );
}
