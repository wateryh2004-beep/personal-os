"use client";
import { useState, useTransition } from "react";
import {
  createDecisionAction,
  createPersonalMemoryAction,
} from "@/features/memory/actions";
import { getWorkingMemoryState } from "@/features/memory/types";
export function MemoryWorkspace({
  memories,
  decisions,
}: {
  memories: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
}) {
  const [tab, setTab] = useState<"profile" | "working" | "decisions">(
    "profile",
  );
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const createMemory = (type: "profile" | "working", form: FormData) =>
    start(async () => {
      try {
        await createPersonalMemoryAction({
          memoryType: type,
          title: form.get("title"),
          content: form.get("content"),
          aiVisibility: form.get("ai_visibility"),
          validUntil: form.get("valid_until") || null,
          reviewAt: form.get("review_at") || null,
        });
        setMessage("已保存。刷新后可见。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "无法保存。");
      }
    });
  const createDecision = (form: FormData) =>
    start(async () => {
      try {
        await createDecisionAction({
          title: form.get("title"),
          decisionText: form.get("decision_text"),
          rationaleMarkdown: form.get("rationale"),
          contextMarkdown: "",
          importance: form.get("importance"),
          aiVisibility: form.get("ai_visibility"),
        });
        setMessage("决定已记录。刷新后可见。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "无法保存。");
      }
    });
  const visible =
    tab === "decisions"
      ? decisions
      : memories.filter((item) => item.memory_type === tab);
  return (
    <section>
      <div className="mb-6 flex gap-2 border-b">
        {(["profile", "working", "decisions"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`border-b-2 px-3 py-2 text-sm ${tab === item ? "border-[#365F78] text-[#365F78]" : "border-transparent text-zinc-500"}`}
          >
            {item === "profile"
              ? "长期事实"
              : item === "working"
                ? "当前状态"
                : "决定"}
          </button>
        ))}
      </div>
      <form
        action={
          tab === "decisions"
            ? createDecision
            : (form) => createMemory(tab, form)
        }
        className="grid gap-2 border p-4 text-sm"
      >
        <input
          name="title"
          required
          maxLength={tab === "decisions" ? 200 : 160}
          placeholder={tab === "decisions" ? "决定标题" : "标题"}
          className="border px-3 py-2"
        />
        <textarea
          name={tab === "decisions" ? "decision_text" : "content"}
          required
          placeholder={
            tab === "decisions" ? "我决定……" : "只保存你确认的重要信息。"
          }
          className="min-h-24 border px-3 py-2"
        />
        {tab === "decisions" ? (
          <>
            <textarea
              name="rationale"
              placeholder="理由（可选）"
              className="min-h-16 border px-3 py-2"
            />
            <select
              name="importance"
              defaultValue="normal"
              className="border px-3 py-2"
            >
              <option value="low">低重要性</option>
              <option value="normal">普通重要性</option>
              <option value="high">高重要性</option>
            </select>
          </>
        ) : tab === "working" ? (
          <div className="grid gap-2 md:grid-cols-2">
            <label>
              有效至
              <input
                type="datetime-local"
                name="valid_until"
                className="ml-2 border px-2 py-1"
              />
            </label>
            <label>
              复核时间
              <input
                type="datetime-local"
                name="review_at"
                className="ml-2 border px-2 py-1"
              />
            </label>
          </div>
        ) : null}
        <select
          name="ai_visibility"
          defaultValue="normal"
          className="border px-3 py-2"
        >
          <option value="normal">AI 可正常使用</option>
          <option value="sensitive">敏感：仅明确相关时使用</option>
          <option value="never">永不发送给 AI</option>
        </select>
        <button
          disabled={pending}
          className="justify-self-start bg-[#365F78] px-3 py-2 text-white disabled:opacity-50"
        >
          {pending
            ? "保存中…"
            : tab === "decisions"
              ? "记录决定"
              : tab === "profile"
                ? "添加长期事实"
                : "添加当前状态"}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-zinc-600">{message}</p> : null}
      <div className="mt-6 divide-y border-y">
        {visible.length ? (
          visible.map((item) => {
            const state =
              tab === "working"
                ? getWorkingMemoryState(item as never)
                : item.status;
            return (
              <article key={String(item.id)} className="py-4">
                <div className="flex justify-between gap-4">
                  <h2 className="font-medium">{String(item.title)}</h2>
                  <span className="text-xs text-zinc-500">
                    {String(state)} · {String(item.ai_visibility)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                  {String(item.content ?? item.decision_text)}
                </p>
                {item.rationale_markdown ? (
                  <p className="mt-2 text-sm text-zinc-500">
                    理由：{String(item.rationale_markdown)}
                  </p>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="py-10 text-sm text-zinc-500">
            Memory 只保存你确认过的重要信息。
          </p>
        )}
      </div>
    </section>
  );
}
