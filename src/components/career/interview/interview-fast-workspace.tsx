"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createInterviewContext,
  createInterviewQuestion,
  saveInterviewWorkspace,
} from "@/features/interview/actions";

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
  thoughts: string;
  answer: string;
  answerId: string | null;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function workspaceUrl(contextId: string, questionId: string) {
  const params = new URLSearchParams();
  if (contextId) params.set("context", contextId);
  if (questionId) params.set("question", questionId);
  const query = params.toString();
  return query ? `/career/interview?${query}` : "/career/interview";
}

export function InterviewFastWorkspace({
  targets,
  items,
  initialContextId,
  initialQuestionId,
}: {
  targets: Target[];
  items: WorkspaceItem[];
  initialContextId: string;
  initialQuestionId: string;
}) {
  const initialItems = items.filter((item) => (initialContextId ? item.contextId === initialContextId : item.contextId === null));
  const initialItem =
    initialItems.find((item) => item.questionId === initialQuestionId)
    ?? initialItems[0]
    ?? null;

  const [contextId, setContextId] = useState(initialContextId);
  const [questionId, setQuestionId] = useState(initialItem?.questionId ?? "");
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
  const answerIdRef = useRef<string | null>(initialItem?.answerId ?? null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const visibleItems = useMemo(
    () => items.filter((item) => (contextId ? item.contextId === contextId : item.contextId === null)),
    [contextId, items],
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
          answerIdRef.current = result.answerId ?? null;
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

  const replaceUrl = useCallback((nextContextId: string, nextQuestionId: string) => {
    window.history.replaceState(null, "", workspaceUrl(nextContextId, nextQuestionId));
  }, []);

  const switchItem = useCallback((nextContextId: string, nextItem: WorkspaceItem | null) => {
    void saveNow();

    selectedRef.current = nextItem;
    const draft = nextItem ? draftsRef.current.get(nextItem.preparationId) : null;
    const nextThoughts = draft?.thoughts ?? nextItem?.thoughts ?? "";
    const nextAnswer = draft?.answer ?? nextItem?.answer ?? "";
    answerIdRef.current = draft?.answerId ?? nextItem?.answerId ?? null;
    dirtyRef.current = false;
    setContextId(nextContextId);
    setQuestionId(nextItem?.questionId ?? "");
    setThoughts(nextThoughts);
    setAnswer(nextAnswer);
    thoughtsRef.current = nextThoughts;
    answerRef.current = nextAnswer;
    setSaveState("idle");
    replaceUrl(nextContextId, nextItem?.questionId ?? "");
  }, [replaceUrl, saveNow]);

  const handleContextChange = (nextContextId: string) => {
    const nextItems = items.filter((item) => (nextContextId ? item.contextId === nextContextId : item.contextId === null));
    switchItem(nextContextId, nextItems[0] ?? null);
  };

  const handleQuestionChange = (nextQuestionId: string) => {
    const nextItem = visibleItems.find((item) => item.questionId === nextQuestionId) ?? null;
    switchItem(contextId, nextItem);
  };

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 1400);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  const selected = selectedRef.current;

  return (
    <div className="interview-workspace -mx-2 sm:-mx-3">
      <div className="mb-4 flex min-h-9 flex-wrap items-center justify-between gap-2.5 px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href="/career" prefetch className="pressable rounded-[8px] px-1 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">← Career</Link>
          <select
            value={contextId}
            onChange={(event) => handleContextChange(event.target.value)}
            className="max-w-[300px] rounded-[9px] bg-[var(--surface-control)] px-2.5 py-1.5 text-[13px] font-medium tracking-[-0.006em] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
          >
            <option value="">通用题目</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.organization ? target.organization + " · " : ""}{target.role || target.title}
              </option>
            ))}
          </select>
        </div>

        <details>
          <summary className="pressable cursor-pointer list-none rounded-[8px] px-1.5 py-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">+ 岗位</summary>
          <form action={createInterviewContext} className="mt-3 grid w-[min(480px,88vw)] gap-3 rounded-[14px] border border-[var(--separator)] bg-[var(--material-popover)] p-4 shadow-[var(--shadow-popover)] backdrop-blur-2xl backdrop-saturate-[180%] sm:grid-cols-2">
            <input name="organization_snapshot" required placeholder="公司" className="rounded-[9px] bg-[var(--surface-control)] px-3 py-2 text-[13px] outline-none focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
            <input name="role_title_snapshot" required placeholder="岗位" className="h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" />
            <input type="hidden" name="context_type" value="target" />
            <input type="hidden" name="return_to_workspace" value="1" />
            <button className="pressable w-fit rounded-[9px] bg-[var(--accent)] px-3 py-2 text-[13px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]">创建</button>
          </form>
        </details>
      </div>

      <div className="grid min-h-[680px] gap-5 md:grid-cols-[286px_minmax(0,1fr)] md:gap-8">
        <aside className="min-h-0 rounded-[16px] bg-[color-mix(in_srgb,var(--surface-control)_48%,transparent)] p-2.5 ring-1 ring-inset ring-black/[0.022]">
          <form action={createInterviewQuestion} className="mb-2.5">
            <textarea
              required
              name="canonical_prompt"
              rows={2}
              placeholder="+ 新问题"
              className="w-full resize-none rounded-[10px] bg-[var(--surface-canvas)] px-2.5 py-2 text-[13px] leading-5 text-[var(--text-primary)] shadow-[var(--shadow-control)] outline-none ring-1 ring-inset ring-black/[0.035] placeholder:text-[var(--text-tertiary)] focus:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
            />
            <input type="hidden" name="context_id" value={contextId} />
            <input type="hidden" name="return_to_workspace" value="1" />
            <input type="hidden" name="short_title" value="" />
            <input type="hidden" name="category" value="behavioral" />
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
            <button className="ml-2 mt-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--accent)]">添加</button>
          </form>

          <nav aria-label="面试题目" className="max-h-[260px] space-y-px overflow-y-auto pr-0.5 md:max-h-[600px]">
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
            {!visibleItems.length ? <p className="px-2 py-4 text-xs text-zinc-400">还没有题目。</p> : null}
          </nav>
        </aside>

        <main className="min-w-0 px-2 py-3.5 sm:px-3 md:px-0 md:py-4.5">
          {selected ? (
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-5">
                <h1 className="max-w-3xl text-[23px] font-semibold leading-[1.42] tracking-[-0.035em] text-[var(--text-primary)]">{selected.prompt}</h1>
                <Link
                  href={`/career/interview/practice/${selected.preparationId}`}
                  prefetch={false}
                  onClick={() => { void saveNow(); }}
                  className="mt-1 shrink-0 text-[11px] font-medium text-[var(--text-tertiary)] transition-colors ui-transition hover:text-[var(--accent)]"
                >
                  练习 →
                </Link>
              </div>

              <section className="mt-9">
                <h2 className="text-[11px] font-semibold tracking-[.012em] text-[var(--text-tertiary)]">思路</h2>
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
                  rows={10}
                  placeholder="把你的思路写下来。"
                  className="mt-1.5 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-[1.75] text-[var(--text-secondary)] outline-none placeholder:text-[color-mix(in_srgb,var(--text-tertiary)_62%,transparent)]"
                />
              </section>

              <section className="mt-7">
                <h2 className="text-[11px] font-semibold tracking-[.012em] text-[var(--text-tertiary)]">答案</h2>
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
                  placeholder="写出你真正会说的答案。"
                  className="mt-1.5 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-[1.75] text-[var(--text-primary)] outline-none placeholder:text-[color-mix(in_srgb,var(--text-tertiary)_62%,transparent)]"
                />
              </section>

              <div aria-live="polite" className={`mt-2 h-4 text-right text-[10.5px] transition-colors ui-transition ${saveState === "error" ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]"}`}>
                {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存" : saveState === "error" ? "保存失败" : ""}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[520px] place-items-center text-[13px] text-[var(--text-tertiary)]">
              {contextId ? "从左侧添加或选择一道题。" : "选择通用题目，或创建一个岗位。"}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
