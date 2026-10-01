"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createInterviewContext,
  createInterviewQuestion,
  saveInterviewWorkspace,
} from "@/features/interview/actions";
import {
  legacyCategoryByQuestionType,
  questionTypeLabels,
} from "@/features/interview/constants";

type Target = {
  id: string;
  title: string;
  organization: string | null;
  role: string | null;
};

type WorkspaceItem = {
  preparationId: string;
  questionId: string;
  contextId: string | null;
  prompt: string;
  category: string;
  categoryLabel: string;
  style: string;
  subcategory: string | null;
  competencies: Array<{ key: string; label: string }>;
  thoughts: string;
  answer: string;
  answerId: string | null;
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

const SPECIAL_CATEGORIES = ["stress"] as const;
const CLOSING_CATEGORIES = ["candidate_question"] as const;
const ALL_CATEGORIES = [...CORE_CATEGORIES, ...SPECIAL_CATEGORIES, ...CLOSING_CATEGORIES] as const;

const categoryShortLabels: Record<string, string> = {
  ...questionTypeLabels,
  motivation_fit: "动机",
  knowledge: "专业",
  stress: "压力",
};

function workspaceUrl(contextId: string, questionId: string, category: string) {
  const params = new URLSearchParams();
  if (contextId) params.set("context", contextId);
  if (questionId) params.set("question", questionId);
  if (category !== "all") params.set("category", category);
  const query = params.toString();
  return query ? `/career/interview?${query}` : "/career/interview";
}

function isKnownCategory(category: string) {
  return (ALL_CATEGORIES as readonly string[]).includes(category);
}

export function InterviewFastWorkspace({
  targets,
  items,
  initialContextId,
  initialQuestionId,
  initialCategory,
}: {
  targets: Target[];
  items: WorkspaceItem[];
  initialContextId: string;
  initialQuestionId: string;
  initialCategory: string;
}) {
  const initialItems = items.filter((item) =>
    (initialContextId ? item.contextId === initialContextId : item.contextId === null)
    && (initialCategory === "all" || !isKnownCategory(initialCategory)
      || (initialCategory === "stress" ? item.style === "stress" : item.category === initialCategory)),
  );
  const initialItem =
    initialItems.find((item) => item.questionId === initialQuestionId)
    ?? initialItems[0]
    ?? null;
  const resolvedInitialCategory =
    initialCategory === "all" || isKnownCategory(initialCategory)
      ? initialCategory
      : initialItem?.category ?? "all";

  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(initialQuestionId && initialItem));
  const detailRef = useRef<HTMLElement | null>(null);
  const [contextId, setContextId] = useState(initialContextId);
  const [questionId, setQuestionId] = useState(initialItem?.questionId ?? "");
  const [category, setCategory] = useState(resolvedInitialCategory);
  const [thoughts, setThoughts] = useState(initialItem?.thoughts ?? "");
  const [answer, setAnswer] = useState(initialItem?.answer ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const draftsRef = useRef(new Map(items.map((item) => [
    item.preparationId,
    { thoughts: item.thoughts, answer: item.answer, answerId: item.answerId },
  ])));
  const selectedRef = useRef<WorkspaceItem | null>(initialItem);
  const thoughtsRef = useRef(thoughts);
  const answerRef = useRef(answer);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const contextItems = useMemo(
    () => items.filter((item) => (contextId ? item.contextId === contextId : item.contextId === null)),
    [contextId, items],
  );

  const counts = useMemo(() => {
    const next: Record<string, number> = { all: contextItems.length };
    for (const item of contextItems) {
      next[item.category] = (next[item.category] ?? 0) + 1;
      if (item.style === "stress") next.stress = (next.stress ?? 0) + 1;
    }
    return next;
  }, [contextItems]);

  const visibleItems = useMemo(
    () => category === "all"
      ? contextItems
      : category === "stress"
        ? contextItems.filter((item) => item.style === "stress")
        : contextItems.filter((item) => item.category === category),
    [category, contextItems],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const saveNow = useCallback(() => {
    clearTimer();
    const selected = selectedRef.current;
    if (!selected || !dirtyRef.current) return Promise.resolve();

    dirtyRef.current = false;
    const preparationId = selected.preparationId;
    const questionId = selected.questionId;
    const thoughtsSnapshot = thoughtsRef.current;
    const answerSnapshot = answerRef.current;

    if (selectedRef.current?.preparationId === preparationId) setSaveState("saving");

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

        const result = await saveInterviewWorkspace(formData);
        if (draft) {
          draft.answerId = result.answerId ?? null;
          draftsRef.current.set(preparationId, draft);
        }
        if (selectedRef.current?.preparationId === preparationId && !dirtyRef.current) {
          setSaveState("saved");
        }
      })
      .catch(() => {
        if (selectedRef.current?.preparationId === preparationId) {
          dirtyRef.current = true;
          setSaveState("error");
        }
      });

    saveQueueRef.current = queued;
    return queued;
  }, [clearTimer]);

  const scheduleSave = useCallback(() => {
    clearTimer();
    dirtyRef.current = true;
    setSaveState("dirty");
    timerRef.current = window.setTimeout(() => {
      void saveNow();
    }, 650);
  }, [clearTimer, saveNow]);

  const replaceUrl = useCallback((nextContextId: string, nextQuestionId: string, nextCategory: string) => {
    window.history.replaceState(null, "", workspaceUrl(nextContextId, nextQuestionId, nextCategory));
  }, []);

  const switchItem = useCallback((nextContextId: string, nextItem: WorkspaceItem | null, nextCategory = category, updateUrl = true) => {
    void saveNow();

    selectedRef.current = nextItem;
    const draft = nextItem ? draftsRef.current.get(nextItem.preparationId) : null;
    const nextThoughts = draft?.thoughts ?? nextItem?.thoughts ?? "";
    const nextAnswer = draft?.answer ?? nextItem?.answer ?? "";
    dirtyRef.current = false;
    setContextId(nextContextId);
    setQuestionId(nextItem?.questionId ?? "");
    setThoughts(nextThoughts);
    setAnswer(nextAnswer);
    thoughtsRef.current = nextThoughts;
    answerRef.current = nextAnswer;
    setSaveState("idle");
    if (updateUrl) replaceUrl(nextContextId, nextItem?.questionId ?? "", nextCategory);
  }, [category, replaceUrl, saveNow]);

  const handleContextChange = (nextContextId: string) => {
    setMobileDetailOpen(false);
    const nextItems = items.filter((item) => (nextContextId ? item.contextId === nextContextId : item.contextId === null));
    const nextCategory = "all";
    setCategory(nextCategory);
    switchItem(nextContextId, nextItems[0] ?? null, nextCategory, false);
    replaceUrl(nextContextId, "", nextCategory);
  };

  const handleCategoryChange = (nextCategory: string) => {
    setMobileDetailOpen(false);
    const nextVisible = nextCategory === "all"
      ? contextItems
      : nextCategory === "stress"
        ? contextItems.filter((item) => item.style === "stress")
        : contextItems.filter((item) => item.category === nextCategory);
    setCategory(nextCategory);

    const currentStillVisible = nextVisible.find((item) => item.questionId === questionId) ?? null;
    const nextItem = currentStillVisible ?? nextVisible[0] ?? null;
    switchItem(contextId, nextItem, nextCategory, false);
    replaceUrl(contextId, "", nextCategory);
  };

  const handleQuestionChange = (nextQuestionId: string) => {
    const nextItem = visibleItems.find((item) => item.questionId === nextQuestionId) ?? null;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (mobile) {
      // The list is a real history entry so Android Back closes the detail.
      replaceUrl(contextId, "", category);
      window.history.pushState({ interviewDetail: true }, "", workspaceUrl(contextId, nextQuestionId, category));
    }
    switchItem(contextId, nextItem, category, !mobile);
    setMobileDetailOpen(Boolean(nextItem));
  };

  const closeMobileDetail = () => {
    if (window.history.state?.interviewDetail) window.history.back();
    else {
      void saveNow();
      setMobileDetailOpen(false);
      replaceUrl(contextId, "", category);
    }
  };

  useEffect(() => {
    const restoreHistory = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedContext = params.get("context") ?? "";
      const nextContext = targets.some((target) => target.id === requestedContext) ? requestedContext : "";
      const requestedCategory = params.get("category") ?? "all";
      const nextCategory = isKnownCategory(requestedCategory) ? requestedCategory : "all";
      const scoped = items.filter((item) =>
        (nextContext ? item.contextId === nextContext : item.contextId === null)
        && (nextCategory === "all" || (nextCategory === "stress" ? item.style === "stress" : item.category === nextCategory)),
      );
      const requestedQuestion = params.get("question");
      const matched = scoped.find((item) => item.questionId === requestedQuestion);
      setCategory(nextCategory);
      switchItem(nextContext, matched ?? scoped[0] ?? null, nextCategory, false);
      setMobileDetailOpen(Boolean(matched));
    };
    window.addEventListener("popstate", restoreHistory);
    return () => window.removeEventListener("popstate", restoreHistory);
  }, [items, targets, switchItem]);

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

  const selected = contextItems.find((item) => item.questionId === questionId) ?? null;
  const newQuestionType = category === "all" || category === "stress" ? "behavioral" : category;
  const newQuestionCategory = legacyCategoryByQuestionType[newQuestionType] ?? "behavioral";
  const newQuestionStyle = category === "stress" ? "stress" : "standard";

  return (
    <div className="interview-workspace -mx-2 sm:-mx-3">
      <div className="px-2 sm:px-3">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2.5">
          <div className="flex min-w-0 max-w-full items-center gap-2.5">
            <Link href="/career" prefetch className="pressable rounded-[8px] px-1 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">← Career</Link>
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
            <Link href="/career/interview/practice" className="pressable rounded-[8px] px-2 py-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">练习</Link>
            <Link href="/career/interview/insights" className="pressable rounded-[8px] px-2 py-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">复盘</Link>
            <details className="relative">
              <summary className="pressable cursor-pointer list-none rounded-[8px] px-2 py-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">+ 岗位</summary>
              <form action={createInterviewContext} className="absolute right-0 z-30 mt-2 grid w-[min(480px,88vw)] gap-3 rounded-[14px] border border-[var(--separator)] bg-[var(--material-popover)] p-4 shadow-[var(--shadow-popover)] backdrop-blur-2xl backdrop-saturate-[180%] sm:grid-cols-2">
                <input name="organization_snapshot" required placeholder="公司" className="h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] outline-none focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
                <input name="role_title_snapshot" required placeholder="岗位" className="h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
                <input type="hidden" name="context_type" value="target" />
                <input type="hidden" name="return_to_workspace" value="1" />
                <button className="pressable w-fit rounded-[9px] bg-[var(--accent)] px-3 py-2 text-[13px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]">创建</button>
              </form>
            </details>
          </div>
        </div>

        <div className={`${mobileDetailOpen ? "hidden md:block" : ""} mt-5 border-b border-[var(--separator)] pb-3.5`}>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">核心问题</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <CategoryButton label="全部" count={counts.all ?? 0} active={category === "all"} onClick={() => handleCategoryChange("all")} />
            {CORE_CATEGORIES.map((key) => (
              <CategoryButton
                key={key}
                label={categoryShortLabels[key]}
                count={counts[key] ?? 0}
                active={category === key}
                onClick={() => handleCategoryChange(key)}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-tertiary)]">特殊场景</span>
              {SPECIAL_CATEGORIES.map((key) => (
                <CategoryTextButton
                  key={key}
                  label={categoryShortLabels[key]}
                  count={counts[key] ?? 0}
                  active={category === key}
                  onClick={() => handleCategoryChange(key)}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-tertiary)]">收尾</span>
              {CLOSING_CATEGORIES.map((key) => (
                <CategoryTextButton
                  key={key}
                  label={categoryShortLabels[key]}
                  count={counts[key] ?? 0}
                  active={category === key}
                  onClick={() => handleCategoryChange(key)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid min-h-[680px] gap-5 md:grid-cols-[286px_minmax(0,1fr)] md:gap-8">
        <aside data-testid="interview-question-list" className={`${mobileDetailOpen ? "hidden md:block" : ""} min-h-0 rounded-[16px] bg-[color-mix(in_srgb,var(--surface-control)_48%,transparent)] p-2.5 ring-1 ring-inset ring-black/[0.022]`}>
          <form action={createInterviewQuestion} className="mb-2.5">
            <textarea
              required
              name="canonical_prompt"
              rows={2}
              placeholder={category === "all" ? "+ 新问题" : `+ 新建${categoryShortLabels[category] ?? "面试"}题`}
              className="w-full resize-none rounded-[10px] bg-[var(--surface-canvas)] px-2.5 py-2 text-[13px] leading-5 text-[var(--text-primary)] shadow-[var(--shadow-control)] outline-none ring-1 ring-inset ring-black/[0.035] placeholder:text-[var(--text-tertiary)] focus:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
            />
            <div className="mt-1 flex items-center justify-between gap-2 px-1">
              {category === "all" ? (
                <select name="category" defaultValue="behavioral" aria-label="新问题类型" className="max-w-[160px] bg-transparent text-[11px] text-[var(--text-tertiary)] outline-none">
                  {[...CORE_CATEGORIES, ...CLOSING_CATEGORIES].map((key) => (
                    <option key={key} value={legacyCategoryByQuestionType[key] ?? key}>{questionTypeLabels[key]}</option>
                  ))}
                </select>
              ) : category === "stress" ? (
                <select name="question_type_key" defaultValue="behavioral" aria-label="压力题的问题类型" className="max-w-[160px] bg-transparent text-[11px] text-[var(--text-tertiary)] outline-none">
                  {[...CORE_CATEGORIES, ...CLOSING_CATEGORIES].map((key) => (
                    <option key={key} value={key}>{questionTypeLabels[key]}</option>
                  ))}
                </select>
              ) : <input type="hidden" name="category" value={newQuestionCategory} />}
              <button className="pressable rounded-[7px] px-1.5 py-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]">添加</button>
            </div>
            {category === "stress" ? <input type="hidden" name="category" value="behavioral" /> : null}
            <input type="hidden" name="question_style" value={newQuestionStyle} />
            <input type="hidden" name="context_id" value={contextId} />
            <input type="hidden" name="return_to_workspace" value="1" />
            <input type="hidden" name="short_title" value="" />
            <input type="hidden" name="subcategory" value="" />
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
          </form>

          <div className="mb-1.5 flex items-center justify-between px-2">
            <span className="text-[10.5px] font-medium text-[var(--text-tertiary)]">{category === "all" ? "全部问题" : category === "stress" ? "压力风格" : questionTypeLabels[category] ?? "问题"}</span>
            <span className="text-[10.5px] tabular-nums text-[var(--text-tertiary)]">{visibleItems.length}</span>
          </div>

          <nav aria-label="面试题目" className="space-y-px pr-0.5 md:max-h-[600px] md:overflow-y-auto">
            {visibleItems.map((item) => {
              const active = item.questionId === questionId;
              return (
                <button
                  type="button"
                  key={item.preparationId}
                  onClick={() => handleQuestionChange(item.questionId)}
                  className={`pressable block w-full rounded-[9px] px-2.5 py-2.5 text-left text-[13px] leading-[1.45] ${active ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-white/55 hover:text-[var(--text-primary)]"}`}
                >
                  <span className="line-clamp-2">{item.prompt}</span>
                </button>
              );
            })}
            {!visibleItems.length ? <p className="px-2 py-4 text-xs text-[var(--text-tertiary)]">这个分类还没有问题。</p> : null}
          </nav>
        </aside>

        <main ref={detailRef} tabIndex={-1} aria-label="面试题目详情" data-testid="interview-question-detail" className={`${mobileDetailOpen ? "block" : "hidden md:block"} min-w-0 scroll-mt-4 px-2 py-3.5 outline-none sm:px-3 md:px-0 md:py-4.5`}>
          <button type="button" onClick={closeMobileDetail} className="mb-4 min-h-11 rounded-[9px] px-3 text-[13px] font-medium text-[var(--accent)] md:hidden">← 返回题目列表</button>
          {selected ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3 md:flex-nowrap md:gap-5">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[10.5px] text-[var(--text-tertiary)]">
                    <span>{selected.categoryLabel}</span>
                    {selected.style === "stress" ? <span>· 压力</span> : null}
                    {selected.competencies.slice(0, 2).map((competency) => <span key={competency.key}>· {competency.label}</span>)}
                  </div>
                  <h1 className="max-w-3xl text-[23px] font-semibold leading-[1.42] tracking-[-0.035em] text-[var(--text-primary)]">{selected.prompt}</h1>
                </div>
                <Link
                  href={`/career/interview/questions/${selected.questionId}${contextId ? `?context=${contextId}` : ""}`}
                  prefetch={false}
                  onClick={() => { void saveNow(); }}
                  className="mt-1 shrink-0 rounded-[8px] px-2 py-1 text-[11px] font-medium text-[var(--text-tertiary)] transition-colors ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                >
                  完整题目与答案 →
                </Link>
              </div>

              <section className="mt-9">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[11px] font-semibold tracking-[.012em] text-[var(--text-tertiary)]">思路</h2>
                  <span className="text-[10.5px] text-[var(--text-tertiary)]">先想清楚，再组织表达</span>
                </div>
                <textarea
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
                    scheduleSave();
                  }}
                  onBlur={() => { void saveNow(); }}
                  rows={9}
                  placeholder="这道题真正考什么？我要证明什么？用哪段经历或事实？"
                  className="mt-1.5 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-[1.75] text-[var(--text-secondary)] outline-none placeholder:text-[color-mix(in_srgb,var(--text-tertiary)_62%,transparent)]"
                />
              </section>

              <section className="mt-7">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[11px] font-semibold tracking-[.012em] text-[var(--text-tertiary)]">答案</h2>
                  <span className="text-[10.5px] text-[var(--text-tertiary)]">写成你面试时真正会说的话</span>
                </div>
                <textarea
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
                    scheduleSave();
                  }}
                  onBlur={() => { void saveNow(); }}
                  rows={13}
                  placeholder="直接回答，不写作文。"
                  className="mt-1.5 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-[1.75] text-[var(--text-primary)] outline-none placeholder:text-[color-mix(in_srgb,var(--text-tertiary)_62%,transparent)]"
                />
              </section>

              <div aria-live="polite" className={`mt-2 h-4 text-right text-[10.5px] transition-colors ui-transition ${saveState === "error" ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]"}`}>
                {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存" : saveState === "error" ? "保存失败" : ""}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[520px] place-items-center px-8 text-center text-[13px] leading-6 text-[var(--text-tertiary)]">
              {contextItems.length ? "这个分类还没有问题。你可以直接从左侧添加。" : contextId ? "这个岗位还没有面试题。" : "先添加通用题目，或选择一个目标岗位。"}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

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
      className={`pressable inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] font-medium ${active ? "bg-[var(--text-primary)] text-white shadow-[var(--shadow-control)]" : "bg-[var(--surface-control)] text-[var(--text-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--text-primary)]"}`}
    >
      <span>{label}</span>
      <span className={`text-[10px] tabular-nums ${active ? "text-white/60" : "text-[var(--text-tertiary)]"}`}>{count}</span>
    </button>
  );
}

function CategoryTextButton({
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
      className={`pressable rounded-[7px] px-1.5 py-1 ${active ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}
    >
      {label} <span className="tabular-nums text-[var(--text-tertiary)]">{count}</span>
    </button>
  );
}
