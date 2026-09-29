"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
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

  const selectedRef = useRef<WorkspaceItem | null>(initialItem);
  const thoughtsRef = useRef(thoughts);
  const answerRef = useRef(answer);
  const answerIdRef = useRef<string | null>(initialItem?.answerId ?? null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const saveSequenceRef = useRef(0);

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

  const saveNow = useCallback(async () => {
    clearTimer();
    const selected = selectedRef.current;
    if (!selected || !dirtyRef.current) return;

    dirtyRef.current = false;
    const sequence = ++saveSequenceRef.current;
    setSaveState("saving");

    const formData = new FormData();
    formData.set("preparation_id", selected.preparationId);
    formData.set("question_id", selected.questionId);
    formData.set("answer_id", answerIdRef.current ?? "");
    formData.set("thoughts", thoughtsRef.current);
    formData.set("answer", answerRef.current);

    try {
      const result = await saveInterviewWorkspace(formData);
      if (sequence !== saveSequenceRef.current) return;
      if (selectedRef.current?.preparationId === selected.preparationId) {
        answerIdRef.current = result.answerId ?? null;
        setSaveState("saved");
      }
    } catch {
      if (sequence !== saveSequenceRef.current) return;
      dirtyRef.current = true;
      setSaveState("error");
    }
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
    answerIdRef.current = nextItem?.answerId ?? null;
    dirtyRef.current = false;
    setContextId(nextContextId);
    setQuestionId(nextItem?.questionId ?? "");
    setThoughts(nextItem?.thoughts ?? "");
    setAnswer(nextItem?.answer ?? "");
    thoughtsRef.current = nextItem?.thoughts ?? "";
    answerRef.current = nextItem?.answer ?? "";
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

  const selected = selectedRef.current;

  return (
    <div className="interview-workspace -mx-2 sm:-mx-3">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/career" prefetch className="text-xs text-zinc-400 hover:text-zinc-700">← Career</Link>
          <select
            value={contextId}
            onChange={(event) => handleContextChange(event.target.value)}
            className="max-w-[300px] px-2 py-1.5 text-sm font-medium text-zinc-800"
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
          <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-700">+ 岗位</summary>
          <form action={createInterviewContext} className="mt-3 grid w-[min(480px,88vw)] gap-3 rounded-xl bg-white p-4 shadow-lg ring-1 ring-black/5 sm:grid-cols-2">
            <input name="organization_snapshot" required placeholder="公司" className="px-3 py-2 text-sm" />
            <input name="role_title_snapshot" required placeholder="岗位" className="px-3 py-2 text-sm" />
            <input type="hidden" name="context_type" value="target" />
            <input type="hidden" name="return_to_workspace" value="1" />
            <button className="w-fit rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">创建</button>
          </form>
        </details>
      </div>

      <div className="grid min-h-[680px] gap-6 md:grid-cols-[290px_minmax(0,1fr)] md:gap-10">
        <aside className="min-h-0 rounded-2xl bg-black/[0.025] p-3">
          <form action={createInterviewQuestion} className="mb-3">
            <textarea
              required
              name="canonical_prompt"
              rows={2}
              placeholder="+ 新问题"
              className="w-full resize-none bg-transparent px-2 py-2 text-sm leading-5 text-zinc-700 outline-none placeholder:text-zinc-300"
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
            <button className="ml-2 text-[11px] text-zinc-400 hover:text-zinc-700">添加</button>
          </form>

          <nav aria-label="面试题目" className="max-h-[260px] space-y-0.5 overflow-y-auto pr-1 md:max-h-[600px]">
            {visibleItems.map((item) => {
              const active = item.questionId === questionId;
              return (
                <button
                  type="button"
                  key={item.preparationId}
                  onClick={() => handleQuestionChange(item.questionId)}
                  className={`block w-full rounded-lg px-2.5 py-2.5 text-left text-[13px] leading-5 transition-colors ${active ? "bg-white font-medium text-zinc-950 shadow-sm" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
                >
                  <span className="line-clamp-2">{item.prompt}</span>
                </button>
              );
            })}
            {!visibleItems.length ? <p className="px-2 py-4 text-xs text-zinc-400">还没有题目。</p> : null}
          </nav>
        </aside>

        <main className="min-w-0 px-2 py-4 sm:px-3 md:px-0 md:py-5">
          {selected ? (
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-6">
                <h1 className="max-w-3xl text-[24px] font-semibold leading-9 tracking-[-0.025em] text-zinc-950">{selected.prompt}</h1>
                <Link
                  href={`/career/interview/practice/${selected.preparationId}`}
                  prefetch={false}
                  onClick={() => { void saveNow(); }}
                  className="mt-1 shrink-0 text-xs text-zinc-400 hover:text-zinc-700"
                >
                  练习 →
                </Link>
              </div>

              <section className="mt-10">
                <h2 className="text-xs font-medium text-zinc-400">思路</h2>
                <textarea
                  value={thoughts}
                  onChange={(event) => {
                    const value = event.target.value;
                    setThoughts(value);
                    thoughtsRef.current = value;
                    scheduleSave();
                  }}
                  onBlur={() => { void saveNow(); }}
                  rows={10}
                  placeholder="把你的思路写下来。"
                  className="mt-2 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-7 text-zinc-800 outline-none placeholder:text-zinc-300"
                />
              </section>

              <section className="mt-8">
                <h2 className="text-xs font-medium text-zinc-400">答案</h2>
                <textarea
                  value={answer}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAnswer(value);
                    answerRef.current = value;
                    scheduleSave();
                  }}
                  onBlur={() => { void saveNow(); }}
                  rows={13}
                  placeholder="写出你真正会说的答案。"
                  className="mt-2 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-7 text-zinc-900 outline-none placeholder:text-zinc-300"
                />
              </section>

              <div className="mt-3 h-5 text-right text-[11px] text-zinc-300">
                {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存" : saveState === "error" ? "保存失败" : ""}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[520px] place-items-center text-sm text-zinc-300">
              {contextId ? "从左侧添加或选择一道题。" : "选择通用题目，或创建一个岗位。"}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
