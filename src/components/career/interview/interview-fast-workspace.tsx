"use client";

import { saveWorkspaceSession } from "@/lib/workspace-session";
import { CAREER_CONTINUE_KEY } from "@/components/career/career-continue";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from "react";
import {
  createInterviewContext,
  createInterviewQuestion,
  saveInterviewWorkspace,
} from "@/features/interview/actions";
import {
  legacyCategoryByQuestionType,
  questionTypeLabels,
} from "@/features/interview/constants";
import { emptyLibraryFilters, filterWorkspaceItems, normalizeLibraryFilters, workspaceDomain, workspaceUrl, type LibraryFilters, type WorkspaceItem, type WorkspaceSearchIndex } from "@/features/interview/workspace-library";
import { InterviewStudyView } from "./interview-study-view";

type Target = {
  id: string;
  title: string;
  organization: string | null;
  role: string | null;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const CORE_CATEGORIES = [
  "resume",
  "behavioral",
  "motivation_fit",
  "knowledge",
  "business_case",
  "situational",
] as const;

const ALL_CATEGORIES = [...CORE_CATEGORIES, "candidate_question"];
const categoryShortLabels: Record<string, string> = { ...questionTypeLabels, motivation_fit: "动机", knowledge: "专业", business_case: "商业案例" };

export function InterviewFastWorkspace({
  targets,
  items,
  initialContextId,
  initialQuestionId,
  initialCategory,
  initialQuery = "",
  initialDomain = "all",
  initialStyle = "all",
  unavailable = false,
}: {
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
  // These are mount defaults, not derivations of every textarea keystroke.
  const [{ initialItem, initialFilters, conflictingFilters, requestedItem }] = useState(() => {
    const requestedFilters = normalizeLibraryFilters({ category: initialCategory, q: initialQuery, domain: initialDomain, style: initialStyle });
    const initialScope = items.filter((item) => initialContextId ? item.contextId === initialContextId : item.contextId === null);
    const requestedItem = initialScope.find((item) => item.questionId === initialQuestionId);
    const conflictingFilters = Boolean(requestedItem && !filterWorkspaceItems([requestedItem], requestedFilters, searchIndex).length);
    const initialFilters = conflictingFilters ? emptyLibraryFilters : requestedFilters;
    const initialItems = filterWorkspaceItems(initialScope, initialFilters, searchIndex);
    return { initialItem: requestedItem ?? initialItems[0] ?? null, initialFilters, conflictingFilters, requestedItem };
  });
  const [filters, setFilters] = useState(initialFilters);
  const category = filters.category;
  const [editing, setEditing] = useState(false);

  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(initialQuestionId && initialItem?.questionId === initialQuestionId));
  const detailRef = useRef<HTMLElement | null>(null);
  const [contextId, setContextId] = useState(initialContextId);
  const [questionId, setQuestionId] = useState(initialItem?.questionId ?? "");
  const [thoughts, setThoughts] = useState(initialItem?.thoughts ?? "");
  const [answer, setAnswer] = useState(initialItem?.answer ?? "");
  const [answerId, setAnswerId] = useState(initialItem?.answerId ?? null);
  const [answerMeta, setAnswerMeta] = useState(initialItem?.answerMeta ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [searchDrafts, setSearchDrafts] = useState<Record<string, { thoughts: string; answer: string }>>({});
  const [failedSaves, setFailedSaves] = useState<Record<string, string>>({});
  const pendingSavesRef = useRef(0);
  const answerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [initialDrafts] = useState(() => new Map(items.map((item) => [
    item.preparationId,
    { thoughts: item.thoughts, savedThoughts: item.thoughts, answer: item.answer, savedAnswer: item.answer, answerId: item.answerId, answerMeta: item.answerMeta ?? null },
  ])));
  const draftsRef = useRef(initialDrafts);
  const selectedRef = useRef<WorkspaceItem | null>(initialItem);
  const thoughtsRef = useRef(thoughts);
  const answerRef = useRef(answer);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveSequenceRef = useRef(new Map<string, number>());

  const contextItems = useMemo(
    () => items.filter((item) => contextId ? item.contextId === contextId : item.contextId === null),
    [contextId, items],
  );
  const draftItems = useMemo(
    () => contextItems.map((item) => {
      const draft = searchDrafts[item.preparationId];
      return draft ? { ...item, ...draft } : item;
    }),
    [contextItems, searchDrafts],
  );

  const domains = useMemo(() => [...new Set(contextItems.map(workspaceDomain))].sort((a, b) => a.localeCompare(b, "zh-CN")), [contextItems]);
  // Body edits only affect discovery when there is an active text search.
  const searchItems = filters.q.trim() ? draftItems : contextItems;
  const { domain, style, q } = filters;
  const matchingItems = useMemo(() => filterWorkspaceItems(searchItems, { category: "all", domain, style, q }, searchIndex), [searchItems, domain, style, q, searchIndex]);
  const counts = useMemo(() => {
    const next: Record<string, number> = { all: matchingItems.length };
    for (const item of matchingItems) next[item.category] = (next[item.category] ?? 0) + 1;
    return next;
  }, [matchingItems]);
  const visibleItems = useMemo(() => category === "all" ? matchingItems : matchingItems.filter((item) => item.category === category), [category, matchingItems]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const saveNow = useCallback(() => {
    clearTimer();
    const selected = selectedRef.current;
    if (!selected || !dirtyRef.current) return saveQueueRef.current;

    dirtyRef.current = false;
    const preparationId = selected.preparationId;
    const questionId = selected.questionId;
    const thoughtsSnapshot = thoughtsRef.current;
    const answerSnapshot = answerRef.current;
    const sequence = (saveSequenceRef.current.get(preparationId) ?? 0) + 1;
    saveSequenceRef.current.set(preparationId, sequence);

    if (selectedRef.current?.preparationId === preparationId) setSaveState("saving");

    pendingSavesRef.current += 1;
    const queued = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const draft = draftsRef.current.get(preparationId);
        const formData = new FormData();
        formData.set("preparation_id", preparationId);
        formData.set("question_id", questionId);
        formData.set("answer_id", draft?.answerId ?? "");
        formData.set("thoughts", thoughtsSnapshot);
        formData.set("answer", answerSnapshot);
        formData.set("answer_changed", answerSnapshot !== draft?.savedAnswer ? "1" : "0");

        const result = await saveInterviewWorkspace(formData);
        setFailedSaves((previous) => { const next = { ...previous }; delete next[preparationId]; return next; });
        if (draft) {
          draft.answerId = result.answerId ?? null;
          draft.answerMeta = result.answerMeta ?? null;
          draft.savedAnswer = answerSnapshot;
          draft.savedThoughts = thoughtsSnapshot;
          draftsRef.current.set(preparationId, draft);
        }
        if (selectedRef.current?.preparationId === preparationId) {
          if (draft && saveSequenceRef.current.get(preparationId) === sequence) dirtyRef.current = draft.answer !== draft.savedAnswer || draft.thoughts !== draft.savedThoughts;
          setAnswerId(result.answerId ?? null);
          setAnswerMeta(result.answerMeta ?? null);
          // Pin the actual displayed version so reloading a saved draft cannot hide it behind a current answer.
          if (window.location.pathname === "/career/interview" && result.answerId) {
            const params = new URLSearchParams(window.location.search);
            if (params.get("question") === questionId || !window.matchMedia("(max-width: 767px)").matches) {
              params.set("question", questionId);
              params.set("answer", result.answerId);
              window.history.replaceState(window.history.state, "", `/career/interview?${params}`);
            }
          }
        }
        if (selectedRef.current?.preparationId === preparationId && !dirtyRef.current && saveSequenceRef.current.get(preparationId) === sequence) {
          setSaveError("");
          setSaveState("saved");
        }
      })
      .catch((error: unknown) => {
        setFailedSaves((previous) => ({ ...previous, [preparationId]: error instanceof Error ? error.message : "保存失败，请重试。" }));
        if (selectedRef.current?.preparationId === preparationId) {
          if (saveSequenceRef.current.get(preparationId) === sequence) dirtyRef.current = true;
          setSaveError(error instanceof Error ? error.message : "保存失败，请重试。");
          setSaveState("error");
        }
      })
      .finally(() => { pendingSavesRef.current -= 1; });

    saveQueueRef.current = queued;
    return queued;
  }, [clearTimer]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!pendingSavesRef.current && ![...draftsRef.current.values()].some((draft) => draft.answer !== draft.savedAnswer || draft.thoughts !== draft.savedThoughts)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => { clearTimer(); window.removeEventListener("beforeunload", warnBeforeLeaving); };
  }, [clearTimer]);

  const scheduleSave = useCallback(() => {
    clearTimer();
    dirtyRef.current = true;
    setSaveState("dirty");
    timerRef.current = window.setTimeout(() => {
      void saveNow();
    }, 650);
  }, [clearTimer, saveNow]);

  const replaceUrl = useCallback((nextContextId: string, nextQuestionId: string, nextFilters: LibraryFilters, answerId?: string | null) => {
    window.history.replaceState(window.history.state, "", workspaceUrl(nextContextId, nextQuestionId, nextFilters, answerId));
  }, []);

  useEffect(() => {
    if (conflictingFilters) replaceUrl(initialContextId, initialQuestionId, emptyLibraryFilters, requestedItem?.answerId);
    // Canonicalize only the initial server-provided deep link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchItem = useCallback((nextContextId: string, nextItem: WorkspaceItem | null, nextFilters: LibraryFilters, updateUrl = true) => {
    void saveNow();
    selectedRef.current = nextItem;
    const draft = nextItem ? draftsRef.current.get(nextItem.preparationId) : null;
    const nextThoughts = draft?.thoughts ?? nextItem?.thoughts ?? "";
    const nextAnswer = draft?.answer ?? nextItem?.answer ?? "";
    dirtyRef.current = Boolean(draft && (draft.thoughts !== draft.savedThoughts || draft.answer !== draft.savedAnswer));
    setContextId(nextContextId);
    setQuestionId(nextItem?.questionId ?? "");
    setThoughts(nextThoughts);
    setAnswer(nextAnswer);
    setAnswerId(draft?.answerId ?? nextItem?.answerId ?? null);
    setAnswerMeta(draft?.answerMeta ?? nextItem?.answerMeta ?? null);
    setEditing(false);
    thoughtsRef.current = nextThoughts;
    answerRef.current = nextAnswer;
    setSaveState(dirtyRef.current ? "dirty" : "idle");
    setSaveError("");
    if (updateUrl) replaceUrl(nextContextId, nextItem?.questionId ?? "", nextFilters, draft?.answerId ?? nextItem?.answerId);
  }, [replaceUrl, saveNow]);

  const handleContextChange = (nextContextId: string) => {
    setMobileDetailOpen(false);
    const nextItems = items.filter((item) => nextContextId ? item.contextId === nextContextId : item.contextId === null);
    setFilters(emptyLibraryFilters);
    switchItem(nextContextId, nextItems[0] ?? null, emptyLibraryFilters, false);
    replaceUrl(nextContextId, "", emptyLibraryFilters);
  };

  const handleFiltersChange = (patch: Partial<LibraryFilters>) => {
    const next = normalizeLibraryFilters({ ...filters, ...patch });
    const visible = filterWorkspaceItems(draftItems, next, searchIndex);
    setFilters(next);
    setMobileDetailOpen(false);
    switchItem(contextId, visible.find((item) => item.questionId === questionId) ?? visible[0] ?? null, next, false);
    replaceUrl(contextId, "", next);
  };

  const handleQuestionChange = useCallback((nextQuestionId: string) => {
    const nextItem = contextItems.find((item) => item.questionId === nextQuestionId) ?? null;
    if (!nextItem) return;
    const draft = draftsRef.current.get(nextItem.preparationId);
    const searchableItem = draft ? { ...nextItem, thoughts: draft.thoughts, answer: draft.answer } : nextItem;
    const nextFilters = filterWorkspaceItems([searchableItem], filters, searchIndex).length ? filters : emptyLibraryFilters;
    setFilters(nextFilters);
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (mobile && !mobileDetailOpen) {
      // Keep the filtered list in history so Back restores the same discovery context.
      replaceUrl(contextId, "", nextFilters);
      window.history.pushState({ interviewDetail: true }, "", workspaceUrl(contextId, nextQuestionId, nextFilters, draftsRef.current.get(nextItem.preparationId)?.answerId));
    }
    switchItem(contextId, nextItem, nextFilters, !mobile || mobileDetailOpen);
    setMobileDetailOpen(true);
  }, [contextItems, filters, searchIndex, mobileDetailOpen, contextId, replaceUrl, switchItem]);

  const closeMobileDetail = () => {
    if (window.history.state?.interviewDetail) window.history.back();
    else {
      void saveNow();
      setMobileDetailOpen(false);
      replaceUrl(contextId, "", filters);
    }
  };

  useEffect(() => {
    const restoreHistory = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedContext = params.get("context") ?? "";
      const nextContext = targets.some((target) => target.id === requestedContext) ? requestedContext : "";
      const nextFilters = normalizeLibraryFilters({ category: params.get("category") ?? "all", domain: params.get("domain") ?? "all", style: params.get("style") ?? "all", q: params.get("q") ?? "" });
      const scoped = filterWorkspaceItems(items.filter((item) => nextContext ? item.contextId === nextContext : item.contextId === null).map((item) => { const draft = draftsRef.current.get(item.preparationId); return draft ? { ...item, thoughts: draft.thoughts, answer: draft.answer } : item; }), nextFilters, searchIndex);
      const matched = scoped.find((item) => item.questionId === params.get("question"));
      setFilters(nextFilters);
      switchItem(nextContext, matched ?? scoped[0] ?? null, nextFilters, false);
      setMobileDetailOpen(Boolean(matched));
    };
    window.addEventListener("popstate", restoreHistory);
    return () => window.removeEventListener("popstate", restoreHistory);
  }, [items, targets, switchItem, searchIndex]);

  useEffect(() => {
    if (mobileDetailOpen && window.matchMedia("(max-width: 767px)").matches) {
      detailRef.current?.scrollIntoView({ block: "start" });
      detailRef.current?.focus({ preventScroll: true });
    }
  }, [mobileDetailOpen, questionId]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 1400);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  useEffect(() => {
    const textarea = answerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(312, textarea.scrollHeight)}px`;
  }, [answer, questionId, mobileDetailOpen, editing]);

  const selected = contextItems.find((item) => item.questionId === questionId) ?? null;
  const relatedItems = useMemo(() => selected ? contextItems.filter((item) => item.parentQuestionId === selected.questionId || (selected.parentQuestionId && item.questionId === selected.parentQuestionId)) : [], [contextItems, selected]);
  const detailParams = new URLSearchParams();
  if (contextId) detailParams.set("context", contextId);
  if (answerId) detailParams.set("answer", answerId);
  const detailHref = selected ? `/career/interview/questions/${selected.questionId}${detailParams.size ? `?${detailParams}` : ""}` : "";
  const followDetailLink = (event: MouseEvent<HTMLAnchorElement>, hash = "") => {
    if (!dirtyRef.current && !pendingSavesRef.current && !Object.keys(failedSaves).length && saveState !== "error") return;
    event.preventDefault();
    const item = selectedRef.current;
    if (!item) return;
    void (async () => {
      await saveNow();
      if (selectedRef.current?.preparationId !== item.preparationId || dirtyRef.current || [...draftsRef.current.values()].some((draft) => draft.answer !== draft.savedAnswer || draft.thoughts !== draft.savedThoughts)) return;
      const saved = draftsRef.current.get(item.preparationId);
      if (!saved || saved.answer !== saved.savedAnswer || saved.thoughts !== saved.savedThoughts) return;
      const params = new URLSearchParams();
      if (item.contextId) params.set("context", item.contextId);
      if (saved.answerId) params.set("answer", saved.answerId);
      router.push(`/career/interview/questions/${item.questionId}${params.size ? `?${params}` : ""}${hash}`);
    })();
  };
  const followWorkspaceLink = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!dirtyRef.current && !pendingSavesRef.current && !Object.keys(failedSaves).length && saveState !== "error") return;
    event.preventDefault();
    const selected = selectedRef.current;
    void (async () => {
      await saveNow();
      if (selectedRef.current !== selected || dirtyRef.current || [...draftsRef.current.values()].some((draft) => draft.answer !== draft.savedAnswer || draft.thoughts !== draft.savedThoughts)) return;
      const draft = selected ? draftsRef.current.get(selected.preparationId) : null;
      if (draft && (draft.answer !== draft.savedAnswer || draft.thoughts !== draft.savedThoughts)) return;
      router.push(href);
    })();
  };
  const newQuestionType = category === "all" ? "behavioral" : category;
  useEffect(() => {
    if (!selected) return;
    saveWorkspaceSession(CAREER_CONTINUE_KEY, {
      href: workspaceUrl(contextId, selected.questionId, filters, answerId),
      label: selected.shortTitle || selected.prompt,
    });
  }, [selected, contextId, filters, answerId]);

  const newQuestionCategory = legacyCategoryByQuestionType[newQuestionType] ?? "behavioral";
  const newQuestionStyle = filters.style === "stress" ? "stress" : "standard";

  return (
    <div className="interview-workspace -mx-2 sm:-mx-3">
      <div className="px-2 sm:px-3">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2.5">
          <div className="flex min-w-0 max-w-full items-center gap-2.5">
            <Link href="/career" onClick={(event) => followWorkspaceLink(event, "/career")} prefetch className="pressable rounded-[8px] px-1 py-0.5 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">← 工作台</Link>
            <select
              aria-label="面试岗位"
              value={contextId}
              onChange={(event) => handleContextChange(event.target.value)}
              className="min-w-0 max-w-[min(320px,65vw)] rounded-[9px] bg-[var(--surface-control)] px-2.5 py-1.5 text-[13px] font-medium tracking-[-0.006em] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
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
            <Link href={`/career/interview/practice?context=${encodeURIComponent(contextId || "general")}`} onClick={(event) => followWorkspaceLink(event, `/career/interview/practice?context=${encodeURIComponent(contextId || "general")}`)} className="pressable rounded-[8px] px-2 py-1 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">练习</Link>
            <Link href={`/career/interview/insights?context=${encodeURIComponent(contextId || "general")}`} onClick={(event) => followWorkspaceLink(event, `/career/interview/insights?context=${encodeURIComponent(contextId || "general")}`)} className="pressable rounded-[8px] px-2 py-1 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">复盘</Link>
            <details className="relative">
              <summary className="pressable cursor-pointer list-none rounded-[8px] px-2 py-1 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">+ 岗位</summary>
              <form action={createInterviewContext} className="absolute right-0 z-30 mt-2 grid w-[min(480px,88vw)] gap-3 rounded-[14px] border border-[var(--separator)] bg-[var(--material-popover)] p-4 shadow-[var(--shadow-popover)] sm:grid-cols-2">
                <input name="organization_snapshot" required placeholder="公司" className="h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] outline-none focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
                <input name="role_title_snapshot" required placeholder="岗位" className="h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
                <input type="hidden" name="context_type" value="target" />
                <input type="hidden" name="return_to_workspace" value="1" />
                <button className="pressable w-fit rounded-[9px] bg-[var(--accent)] px-3 py-2 text-[13px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]">创建</button>
              </form>
            </details>
          </div>
        </div>

        <div className={`${mobileDetailOpen ? "hidden md:block" : ""} mt-5 border-b border-[var(--separator)] pb-4`}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div><h1 className="text-xl font-semibold leading-[1.3] tracking-[-0.015em]">面试准备</h1><p className="mt-1 text-[12px] leading-6 text-[var(--text-tertiary)]">理解知识与推导，整理自己的表达，再练习复盘</p></div>
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
        {Object.keys(failedSaves).length ? <div role="alert" className="mt-3 rounded-[9px] bg-[var(--surface-control)] p-3 text-[12px] leading-6 text-[var(--danger)]">修改还未保存，请重试后再离开。{Object.entries(failedSaves).map(([id, error]) => { const item = items.find((entry) => entry.preparationId === id); return item ? <button type="button" key={id} onClick={() => { setFilters(emptyLibraryFilters); switchItem(item.contextId ?? "", item, emptyLibraryFilters); setMobileDetailOpen(true); setEditing(true); setSaveError(error); setSaveState("error"); }} className="block min-h-11 text-left underline">{item.shortTitle || item.prompt}：{error}</button> : null; })}</div> : null}
        {unavailable ? <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-[9px] bg-[var(--surface-control)] p-3 text-[13px] text-[var(--danger)]">部分题库数据加载失败，当前结果可能不完整。<button type="button" onClick={() => { void (async () => { await saveNow(); if (![...draftsRef.current.values()].some((draft) => draft.answer !== draft.savedAnswer || draft.thoughts !== draft.savedThoughts)) startRefresh(() => router.refresh()); })(); }} disabled={refreshing} className="min-h-8 underline">{refreshing ? "重新加载中…" : "重新加载"}</button></div> : null}
      </div>

      <div className="mt-4 grid min-h-[680px] gap-5 md:grid-cols-[286px_minmax(0,1fr)] md:gap-8">
        <aside data-testid="interview-question-list" className={`${mobileDetailOpen ? "hidden md:block" : ""} min-h-0 rounded-[16px] bg-[color-mix(in_srgb,var(--surface-control)_48%,transparent)] p-2.5 ring-1 ring-inset ring-black/[0.022]`}>
          <details className="mb-3"><summary className="min-h-11 cursor-pointer px-2 py-3 text-[12px] font-medium text-[var(--accent)]">+ 添加自己的问题</summary><form action={createInterviewQuestion} className="mb-2.5">
            <textarea
              required
              name="canonical_prompt"
              rows={2}
              placeholder={category === "all" ? "+ 新问题" : `+ 新建${categoryShortLabels[category] ?? "面试"}题`}
              className="w-full resize-none rounded-[10px] bg-[var(--surface-canvas)] px-2.5 py-2 text-[13px] leading-5 text-[var(--text-primary)] shadow-[var(--shadow-control)] outline-none ring-1 ring-inset ring-black/[0.035] placeholder:text-[var(--text-tertiary)] focus:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
            />
            <div className="mt-1 flex items-center justify-between gap-2 px-1">
              {category === "all" ? (
                <select name="category" defaultValue="behavioral" aria-label="新问题类型" className="max-w-[160px] bg-transparent text-[12px] text-[var(--text-tertiary)] outline-none">
                  {ALL_CATEGORIES.map((key) => (
                    <option key={key} value={legacyCategoryByQuestionType[key] ?? key}>{questionTypeLabels[key]}</option>
                  ))}
                </select>
              ) : <input type="hidden" name="category" value={newQuestionCategory} />}
              <button className="pressable rounded-[7px] px-1.5 py-1 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]">添加</button>
            </div>
            <input type="hidden" name="question_style" value={newQuestionStyle} />
            <input type="hidden" name="context_id" value={contextId} />
            <input type="hidden" name="return_to_workspace" value="1" />
            <input type="hidden" name="short_title" value="" />
            <input type="hidden" name="subcategory" value={filters.domain === "all" ? "" : filters.domain} />
            <input type="hidden" name="competency_tags" value="" />
            <input type="hidden" name="prompt_variants" value="" />
            <input type="hidden" name="source_type" value="manual" />
            <input type="hidden" name="source_name" value="" />
            <input type="hidden" name="source_url" value="" />
            <input type="hidden" name="source_observed_at" value="" />
            <input type="hidden" name="source_detail" value="" />
            <input type="hidden" name="parent_question_id" value="" />
            <input type="hidden" name="follow_up_kind" value="" />
            <input type="hidden" name="difficulty" value="3" />
          </form></details>

          <div className="mb-1.5 flex items-center justify-between px-2">
            <span className="text-[12px] font-medium text-[var(--text-tertiary)]">{category === "all" ? "全部问题" : questionTypeLabels[category] ?? "问题"}</span>
            <span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">{visibleItems.length} / {contextItems.length}</span>
          </div>

          <nav aria-label="面试题目" className="space-y-px pr-0.5 md:max-h-[600px] md:overflow-y-auto">
            <QuestionOptions items={visibleItems} questionId={questionId} onSelect={handleQuestionChange} />
            {!visibleItems.length ? <div className="px-2 py-5 text-[13px] leading-6 text-[var(--text-tertiary)]"><p>{contextItems.length ? "没有找到匹配的问题" : "这个题库还没有问题"}</p><p className="text-xs">{contextItems.length ? "试试其他关键词，或清除筛选。" : "可以添加自己的问题，或切换面试目标。"}</p>{contextItems.length ? <button type="button" onClick={() => handleFiltersChange(emptyLibraryFilters)} className="mt-2 min-h-11 text-[var(--accent)]">清除筛选</button> : null}</div> : null}
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
                <Link
                  href={detailHref}
                  prefetch={false}
                  onClick={(event) => followDetailLink(event)}
                  className="mt-1 shrink-0 rounded-[8px] px-2 py-1 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                >
                  完整题目与答案 →
                </Link>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-[10px] bg-[var(--surface-control)] p-1" aria-label="学习模式">
                  <button type="button" aria-pressed={!editing} onClick={() => { void saveNow(); setEditing(false); }} className={`min-h-9 rounded-[7px] px-4 text-[12px] ${!editing ? "bg-[var(--surface-canvas)] font-medium" : "text-[var(--text-tertiary)]"}`}>阅读学习</button>
                  <button type="button" aria-pressed={editing} onClick={() => setEditing(true)} className={`min-h-9 rounded-[7px] px-4 text-[12px] ${editing ? "bg-[var(--surface-canvas)] font-medium" : "text-[var(--text-tertiary)]"}`}>编辑思路与答案</button>
                </div>
                <Link href={`/career/interview/practice/${selected.preparationId}`} onClick={(event) => followWorkspaceLink(event, `/career/interview/practice/${selected.preparationId}`)} className="inline-flex min-h-11 items-center rounded-[9px] bg-[var(--accent)] px-4 text-[12px] font-medium text-white">练习这道题 →</Link>
              </div>
              {answerMeta ? <div className="mt-4 text-[12px] leading-6 text-[var(--text-tertiary)]"><span>{answerMeta.status === "current" ? "当前答案" : "参考草稿 · 待确认"} · {answerMeta.language === "en" ? "英文" : answerMeta.language === "bilingual" ? "中英双语" : "中文"} · V{answerMeta.version_number} · {answerMeta.source === "ai_draft" ? "AI 起草" : answerMeta.source === "ai_edited" ? "AI 起草后编辑" : answerMeta.source === "imported" ? "导入" : "人工编辑"}</span>{answerMeta.status === "draft" ? <p>可直接阅读；核对个人事实后再设为当前答案。阅读和编辑都不会自动确认。</p> : null}<Link href={`${detailHref}#answer-versions`} prefetch={false} onClick={(event) => followDetailLink(event, "#answer-versions")} className="inline-flex min-h-9 items-center font-medium text-[var(--accent)]">{answerMeta.status === "draft" ? "查看版本并确认答案 →" : "查看答案版本 →"}</Link></div> : null}
              {!editing ? <InterviewStudyView thoughts={thoughts} answer={answer} isDraft={answerMeta?.status === "draft"} learning={selected.learning} related={relatedItems} onSelect={handleQuestionChange} /> : <div>
              <section className="mt-9">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[12px] font-semibold tracking-[.012em] text-[var(--text-tertiary)]">思路</h2>
                  <span className="text-[12px] text-[var(--text-tertiary)]">先想清楚，再组织表达</span>
                </div>
                <textarea
                  disabled={refreshing}
                  aria-label="思路"
                  value={thoughts}
                  onChange={(event) => {
                    const value = event.target.value;
                    setThoughts(value);
                    thoughtsRef.current = value;
                    if (selectedRef.current) {
                      const draft = draftsRef.current.get(selectedRef.current.preparationId);
                      if (draft) {
                        draft.thoughts = value;
                        draftsRef.current.set(selectedRef.current.preparationId, draft);
                      }
                    }
                    if (selectedRef.current) {
                      const id = selectedRef.current.preparationId;
                      const searchDraft = { thoughts: thoughtsRef.current, answer: answerRef.current };
                      setSearchDrafts((previous) => ({ ...previous, [id]: searchDraft }));
                    }
                    scheduleSave();
                  }}
                  onBlur={() => { void saveNow(); }}
                  rows={9}
                  placeholder="这道题真正考什么？我要证明什么？用哪段经历或事实？"
                  className="mt-1.5 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-[1.75] text-[var(--text-secondary)] outline-none placeholder:text-[color-mix(in_srgb,var(--text-tertiary)_62%,transparent)]"
                />
              </section>

              <section className="mt-7">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[12px] font-semibold tracking-[.012em] text-[var(--text-tertiary)]">{answerMeta?.status === "draft" ? "参考答案 · 待确认" : "答案"}</h2>
                  <span className="text-[12px] text-[var(--text-tertiary)]">写成你面试时真正会说的话</span>
                </div>
                <textarea
                  ref={answerTextareaRef}
                  disabled={refreshing}
                  aria-label="答案"
                  value={answer}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAnswer(value);
                    answerRef.current = value;
                    if (selectedRef.current) {
                      const draft = draftsRef.current.get(selectedRef.current.preparationId);
                      if (draft) {
                        draft.answer = value;
                        draftsRef.current.set(selectedRef.current.preparationId, draft);
                      }
                    }
                    if (selectedRef.current) {
                      const id = selectedRef.current.preparationId;
                      const searchDraft = { thoughts: thoughtsRef.current, answer: answerRef.current };
                      setSearchDrafts((previous) => ({ ...previous, [id]: searchDraft }));
                    }
                    scheduleSave();
                  }}
                  onBlur={() => { void saveNow(); }}
                  rows={13}
                  placeholder="直接回答，不写作文。"
                  className="mt-1.5 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-[1.75] text-[var(--text-primary)] outline-none placeholder:text-[color-mix(in_srgb,var(--text-tertiary)_62%,transparent)]"
                />
              </section>

              </div>}
              <div aria-live="polite" className={`mt-2 min-h-4 text-right text-[12px] transition-colors ui-transition ${saveState === "error" ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]"}`}>
                {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存" : saveState === "error" ? saveError || "保存失败" : saveState === "dirty" ? "有未保存的修改" : ""}
              </div>
              {saveState === "error" || saveState === "dirty" ? <button type="button" onClick={() => { void saveNow(); }} className="mt-2 min-h-11 text-xs text-[var(--accent)]">重试保存</button> : null}
              {saveState === "error" && !answer.trim() ? (
                <button type="button" className="mt-2 min-h-11 text-xs text-[var(--accent)]" onClick={() => {
                  const item = selectedRef.current;
                  const draft = item ? draftsRef.current.get(item.preparationId) : null;
                  if (!draft) return;
                  draft.answer = draft.savedAnswer;
                  setAnswer(draft.savedAnswer);
                  answerRef.current = draft.savedAnswer;
                  scheduleSave();
                }}>恢复已保存的答案</button>
              ) : null}
            </div>
          ) : (
            <div className="grid min-h-[520px] place-items-center px-8 text-center text-[13px] leading-6 text-[var(--text-tertiary)]">
              {contextItems.length ? "没有匹配的问题。调整关键词或清除筛选，继续学习。" : contextId ? "这个岗位还没有面试题。" : "先添加通用题目，或选择一个目标岗位。"}
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
