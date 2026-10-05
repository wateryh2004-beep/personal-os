"use client";

import { DisclosureSummary } from "@/components/ui/disclosure";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveWorkspaceSession } from "@/lib/workspace-session";
import { CAREER_CONTINUE_KEY } from "@/components/career/career-continue";
import { questionTypeLabels } from "@/features/interview/constants";
import { emptyLibraryFilters, filterWorkspaceItems, normalizeLibraryFilters, workspaceDomain, workspaceUrl, type LibraryFilters, type WorkspaceItem, type WorkspaceSearchIndex } from "@/features/interview/workspace-library";
import { InterviewPrompt } from "./interview-prompt";
import { presentInterviewPrompt } from "@/features/interview/prompt-presentation";
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
  const questionListRef = useRef<HTMLElement | null>(null);
  const selectionScrollRef = useRef(false);

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
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    if (mobile && !mobileDetailOpen) {
      listScrollRef.current = window.scrollY;
      replaceUrl(contextId, "", nextFilters);
      window.history.pushState({ ...window.history.state, interviewDetail: true }, "", workspaceUrl(contextId, nextQuestionId, nextFilters, nextItem.answerId));
    } else replaceUrl(contextId, nextQuestionId, nextFilters, nextItem.answerId);
    selectionScrollRef.current = true;
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
    if (window.matchMedia("(max-width: 1023px)").matches) {
      if (mobileDetailOpen) {
        detailRef.current?.scrollIntoView({ block: "start" });
        detailRef.current?.focus({ preventScroll: true });
      } else if (previousDetailOpenRef.current) {
        window.scrollTo({ top: listScrollRef.current, behavior: "instant" });
        questionListRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus({ preventScroll: true });
      }
    } else if (selectionScrollRef.current) {
      detailRef.current?.scrollIntoView({ block: "start" });
      detailRef.current?.focus({ preventScroll: true });
    }
    selectionScrollRef.current = false;
    previousDetailOpenRef.current = mobileDetailOpen;
  }, [mobileDetailOpen, questionId]);

  useEffect(() => {
    if (selected) saveWorkspaceSession(CAREER_CONTINUE_KEY, { href: workspaceUrl(contextId, selected.questionId, filters, selected.answerId), label: selected.shortTitle || presentInterviewPrompt(selected.prompt).question });
  }, [selected, contextId, filters]);

  const filterCount = Number(category !== "all") + Number(domain !== "all") + Number(style !== "all");
  const selectedIndex = visibleItems.findIndex((item) => item.questionId === questionId);

  return (
    <div className="interview-workspace -mx-2 sm:-mx-3">
      <header className="mx-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--separator)] pb-4 sm:mx-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/career" prefetch className="inline-flex min-h-11 items-center text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">← 工作台</Link>
          <span className="h-4 w-px bg-[var(--separator)]" aria-hidden="true" />
          <h2 className="text-[16px] font-semibold tracking-tight">面试学习</h2>
        </div>
        <nav aria-label="面试学习导航" className="flex items-center gap-1 text-[12px]">
          <span aria-current="page" className="ui-navigation-item">学习库</span>
          <Link href={`/career/interview/practice?context=${encodeURIComponent(contextId || "general")}`} className="ui-navigation-item">练习</Link>
          <Link href={`/career/interview/insights?context=${encodeURIComponent(contextId || "general")}`} className="ui-navigation-item">复盘</Link>
        </nav>
      </header>
      {unavailable ? <div role="alert" className="mx-3 mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--surface-control)] p-3 text-[13px] text-[var(--danger)]">部分题库数据加载失败，当前结果可能不完整。<button type="button" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing} className="min-h-11 underline">{refreshing ? "重新加载中…" : "重新加载"}</button></div> : null}

      <div className="grid items-start gap-6 pt-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-12">
        <aside data-testid="interview-question-list" className={`${mobileDetailOpen ? "hidden lg:block" : ""} min-w-0 self-start px-2 sm:px-3 lg:sticky lg:top-[calc(var(--toolbar-height)+1rem)]`}>
          <label className="block text-[11px] font-medium text-[var(--text-tertiary)]">面试方向
            <select aria-label="面试岗位" value={contextId} onChange={(event) => handleContextChange(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--separator)] bg-[var(--surface-canvas)] px-3 text-[13px] font-medium text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
              <option value="">通用面试</option>
              {targets.map((target) => <option key={target.id} value={target.id}>{target.organization ? target.organization + " · " : ""}{target.role || target.title}</option>)}
            </select>
          </label>
          <label className="mt-3 block"><span className="sr-only">搜索题库</span><input type="search" aria-label="搜索题库" value={q} onChange={(event) => handleFiltersChange({ q: event.target.value })} placeholder="搜索题目、知识或答案" className="ui-field min-h-11 w-full min-w-0 rounded-lg border border-[var(--control-border)] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" /></label>
          <details className="mt-2 border-b border-[var(--separator)]" data-testid="interview-filters" open={filterCount > 0 || undefined}>
            <DisclosureSummary className="min-h-11 cursor-pointer select-none py-3 text-[12px] text-[var(--text-secondary)]">筛选题库{filterCount ? ` · ${filterCount} 项` : ""}</DisclosureSummary>
            <div className="space-y-3 pb-4">
              <div className="flex flex-wrap gap-1" aria-label="问题类型筛选">
                <CategoryButton label="全部题型" count={counts.all ?? 0} active={category === "all"} onClick={() => handleFiltersChange({ category: "all" })} />
                {ALL_CATEGORIES.map((key) => <CategoryButton key={key} label={categoryShortLabels[key]} count={counts[key] ?? 0} active={category === key} onClick={() => handleFiltersChange({ category: key })} />)}
              </div>
              <label className="grid gap-1 text-[11px] text-[var(--text-tertiary)]">学习模块<select aria-label="学习模块" value={domain} onChange={(event) => handleFiltersChange({ domain: event.target.value })} className="min-h-11 w-full min-w-0 rounded-lg bg-[var(--surface-control)] px-2 text-[13px] text-[var(--text-primary)]"><option value="all">全部模块</option>{domain !== "all" && !domains.includes(domain) ? <option value={domain}>{domain}</option> : null}{domains.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="grid gap-1 text-[11px] text-[var(--text-tertiary)]">提问风格<select aria-label="提问风格" value={style} onChange={(event) => handleFiltersChange({ style: event.target.value })} className="min-h-11 w-full rounded-lg bg-[var(--surface-control)] px-2 text-[13px] text-[var(--text-primary)]"><option value="all">全部风格</option><option value="standard">标准提问</option><option value="stress">压力追问</option></select></label>
              {filterCount ? <button type="button" onClick={() => handleFiltersChange({ ...emptyLibraryFilters, q })} className="min-h-11 text-[12px] text-[var(--accent)]">重置筛选</button> : null}
            </div>
          </details>
          {filterCount ? <div className="ui-active-filters" aria-label="已生效的题库筛选">
            <p>已筛选：{[category !== "all" ? categoryShortLabels[category] ?? category : null, domain !== "all" ? domain : null, style !== "all" ? style === "stress" ? "压力追问" : "标准提问" : null].filter(Boolean).join(" · ")}</p>
            <button type="button" className="ui-link" onClick={() => handleFiltersChange({ ...emptyLibraryFilters, q })}>清除筛选</button>
          </div> : null}
          <div className="flex min-h-12 items-center justify-between gap-2 text-[11px] text-[var(--text-tertiary)]">
            <span>{q ? "搜索结果" : category === "all" ? "全部问题" : questionTypeLabels[category] ?? "问题"}</span>
            <span aria-live="polite" className="tabular-nums">{visibleItems.length} 道题</span>
          </div>
          <nav ref={questionListRef} aria-label="面试题目" className="space-y-1 pr-1 lg:max-h-[calc(100dvh_-_var(--toolbar-height)_-_20rem)] lg:min-h-40 lg:overflow-y-auto lg:overscroll-contain">
            <QuestionOptions items={visibleItems} questionId={questionId} onSelect={handleQuestionChange} />
            {!visibleItems.length ? <div className="px-2 py-5 text-[13px] leading-6 text-[var(--text-tertiary)]"><p>{contextItems.length ? "没有找到匹配的问题" : "这个题库还没有问题"}</p><p className="text-xs">{contextItems.length ? "试试其他关键词，或清除筛选。" : "AI 整理的题目会在这里显示，也可以切换面试目标。"}</p>{contextItems.length ? <button type="button" onClick={() => handleFiltersChange(emptyLibraryFilters)} className="ui-link mt-2 min-h-11 text-[var(--accent)]">清除搜索与筛选</button> : null}</div> : null}
          </nav>
        </aside>

        <main ref={detailRef} tabIndex={-1} aria-label="面试题目详情" data-testid="interview-question-detail" className={`${mobileDetailOpen ? "block" : "hidden lg:block"} min-w-0 scroll-mt-[calc(var(--toolbar-height)+1rem)] px-2 outline-none sm:px-3 lg:border-l lg:border-[var(--separator)] lg:pl-8 xl:pl-12`}>
          <button type="button" onClick={closeMobileDetail} className="mb-4 min-h-11 rounded-[9px] px-3 text-[13px] font-medium text-[var(--accent)] lg:hidden">← 返回题目列表</button>
          {selected ? (
            <div className="mx-auto min-w-0 max-w-[760px]">
              <div className="flex flex-wrap items-start justify-between gap-3 lg:flex-nowrap lg:gap-5">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-tertiary)]">
                    {workspaceDomain(selected) !== "未分类" ? <><span>{workspaceDomain(selected)}</span><span aria-hidden="true">/</span></> : null}<span>{selected.categoryLabel}</span>
                    {selected.style === "stress" ? <span>· 压力</span> : null}
                    {selected.competencies.slice(0, 2).map((competency) => <span key={competency.key}>· {competency.label}</span>)}
                  </div>
                  <InterviewPrompt prompt={selected.prompt} shortTitle={selected.shortTitle} />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--separator)] pb-5">
                <span className="text-[11px] leading-6 text-[var(--text-tertiary)]">{selected.answerMeta?.status === "draft" ? "参考答案 · 待确认" : "先理解，再用自己的话表达"}{selected.answerMeta?.language === "bilingual" ? " · 中英双语" : selected.answerMeta?.language === "en" ? " · 英文" : ""}</span>
                <Link href={`/career/interview/practice/${selected.preparationId}`} className="inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-4 text-[12px] font-medium text-white">练习这道题 →</Link>
              </div>
              <InterviewStudyView key={selected.preparationId} thoughts={selected.thoughts} answer={selected.answer} isDraft={selected.answerMeta?.status === "draft"} learning={selected.learning} related={relatedItems} onSelect={handleQuestionChange} answerMeta={selected.answerMeta} versionHref={`${detailHref}#answer-versions`} />
              <nav aria-label="相邻题目" className="mt-8 flex items-center justify-between gap-3 border-t border-[var(--separator)] pt-4 text-[12px]">
                <button type="button" disabled={selectedIndex <= 0} onClick={() => handleQuestionChange(visibleItems[selectedIndex - 1].questionId)} className="min-h-11 rounded-lg px-3 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-30">← 上一题</button>
                <span className="tabular-nums text-[var(--text-tertiary)]">{selectedIndex + 1} / {visibleItems.length}</span>
                <button type="button" disabled={selectedIndex < 0 || selectedIndex >= visibleItems.length - 1} onClick={() => handleQuestionChange(visibleItems[selectedIndex + 1].questionId)} className="min-h-11 rounded-lg px-3 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-30">下一题 →</button>
              </nav>
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
  const display = presentInterviewPrompt(item.prompt, item.shortTitle);
  return (
    <button
      type="button"
      onClick={() => onSelect(item.questionId)}
      aria-label={display.question}
      aria-current={active ? "true" : undefined}
      className={`ui-selectable-row pressable block min-h-16 w-full rounded-lg border-l-2 px-3 py-3 text-left text-[13px] leading-[1.6] focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${active ? "border-[var(--accent)] bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}
    >
      <span className="line-clamp-2">{display.title === "面试题" ? display.question : display.title}</span>
      <span className="mt-1 block truncate text-[12px] font-normal text-[var(--text-tertiary)]">{workspaceDomain(item) === "未分类" ? item.categoryLabel : workspaceDomain(item)}</span>
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
      className={`pressable inline-flex min-h-11 items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] font-medium ${active ? "bg-[var(--text-primary)] text-white shadow-[var(--shadow-control)]" : "bg-[var(--surface-control)] text-[var(--text-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--text-primary)]"}`}
    >
      <span>{label}</span>
      <span className={`text-[10px] tabular-nums ${active ? "text-white/60" : "text-[var(--text-tertiary)]"}`}>{count}</span>
    </button>
  );
}
