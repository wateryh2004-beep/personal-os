"use client";
import { useState, useTransition } from "react";
import {
  createDecisionAction,
  createPersonalMemoryAction,
  importCodexMemoriesAction,
  replacePersonalMemoryAction,
  reverseDecisionAction,
} from "@/features/memory/actions";
import {
  codexMemoryImportSchema,
  type CodexMemoryImportDocument,
} from "@/features/memory/schemas";
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
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] =
    useState<CodexMemoryImportDocument | null>(null);
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
  const previewImport = () => {
    try {
      const parsed = codexMemoryImportSchema.safeParse(JSON.parse(importText));
      if (!parsed.success) {
        setImportPreview(null);
        setMessage("导入内容不符合 Personal OS Memory 格式。");
        return;
      }
      setImportPreview(parsed.data);
      setMessage(`已解析 ${parsed.data.items.length} 条，确认前不会写入。`);
    } catch {
      setImportPreview(null);
      setMessage("无法解析 JSON，请检查格式。");
    }
  };
  const confirmImport = () =>
    start(async () => {
      if (!importPreview) return;
      try {
        const result = await importCodexMemoriesAction(importPreview);
        setMessage(
          `Codex 上下文已同步：新增 ${result.created} 条，更新 ${result.superseded} 条，确认未变化 ${result.verified} 条。`,
        );
        setImportText("");
        setImportPreview(null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "无法导入上下文。");
      }
    });
  const replaceMemory = (item: Record<string, unknown>, form: FormData) => start(async()=>{try{await replacePersonalMemoryAction({memoryId:item.id,memoryType:item.memory_type,title:form.get("title"),content:form.get("content"),aiVisibility:form.get("ai_visibility"),validUntil:form.get("valid_until")||null,reviewAt:form.get("review_at")||null});setMessage("已建立新版本，旧记忆保留为 superseded。");}catch(error){setMessage(error instanceof Error?error.message:"无法替换记忆。");}});
  const reverseDecision = (item: Record<string, unknown>, form: FormData) => start(async()=>{try{await reverseDecisionAction({decisionId:item.id,title:form.get("title"),decisionText:form.get("decision_text"),rationaleMarkdown:form.get("rationale"),reviewAt:form.get("review_at")||null});setMessage("已记录反转决定，原决定历史已保留。");}catch(error){setMessage(error instanceof Error?error.message:"无法反转决定。");}});
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
      <details className="mb-6 border-y py-4">
        <summary className="cursor-pointer text-sm font-medium text-[#365F78]">
          从 Codex 导入个人上下文
        </summary>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          只接收结构化的事实、偏好、目标和当前状态，不上传聊天原文。先预览，再确认写入；同一记忆发生变化时保留旧版本。
        </p>
        <textarea
          value={importText}
          onChange={(event) => {
            setImportText(event.target.value);
            setImportPreview(null);
          }}
          maxLength={200000}
          placeholder="粘贴 Codex 导出的 Memory JSON"
          className="mt-3 min-h-32 w-full max-w-3xl resize-y rounded-md border border-zinc-200 px-3 py-2 font-mono text-xs outline-none focus:border-[#365F78]"
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={!importText.trim() || pending}
            onClick={previewImport}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            预览
          </button>
          {importPreview ? (
            <button
              type="button"
              disabled={pending}
              onClick={confirmImport}
              className="rounded-md bg-[#365F78] px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {pending
                ? "导入中…"
                : `确认导入 ${importPreview.items.length} 条`}
            </button>
          ) : null}
        </div>
        {importPreview ? (
          <div className="mt-4 max-w-3xl divide-y border-y">
            {importPreview.items.map((item) => (
              <article key={item.memoryKey} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-sm font-medium">{item.title}</h3>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {item.memoryType === "profile" ? "长期事实" : "当前状态"}
                    {` · ${item.confidence}%`}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                  {item.content}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </details>
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
                {item.created_via === "codex_import" ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    来源：Codex
                    {item.confidence !== undefined
                      ? ` · 置信度 ${String(item.confidence)}%`
                      : ""}
                  </p>
                ) : null}
                {item.rationale_markdown ? (
                  <p className="mt-2 text-sm text-zinc-500">
                    理由：{String(item.rationale_markdown)}
                  </p>
                ) : null}
                {item.status === "active" ? <details className="mt-3"><summary className="cursor-pointer text-xs text-[#365F78]">{tab === "decisions" ? "反转此决定…" : "更正此记忆…"}</summary>{tab === "decisions" ? <form action={(form)=>reverseDecision(item,form)} className="mt-3 grid gap-2 border-l-2 pl-3"><input name="title" required defaultValue={`反转：${String(item.title)}`} className="border px-2 py-1.5 text-sm"/><textarea name="decision_text" required placeholder="现在的新决定" className="min-h-20 border px-2 py-1.5 text-sm"/><textarea name="rationale" placeholder="为什么反转" className="min-h-16 border px-2 py-1.5 text-sm"/><label className="text-xs">下次复核 <input name="review_at" type="datetime-local" className="ml-2 border px-2 py-1"/></label><button disabled={pending} className="w-fit border px-3 py-1.5 text-sm disabled:opacity-50">确认反转并保留历史</button></form> : <form action={(form)=>replaceMemory(item,form)} className="mt-3 grid gap-2 border-l-2 pl-3"><input name="title" required defaultValue={String(item.title)} className="border px-2 py-1.5 text-sm"/><textarea name="content" required defaultValue={String(item.content)} className="min-h-20 border px-2 py-1.5 text-sm"/><select name="ai_visibility" defaultValue={String(item.ai_visibility)} className="border px-2 py-1.5 text-sm"><option value="normal">AI 可正常使用</option><option value="sensitive">敏感</option><option value="never">永不发送给 AI</option></select>{tab === "working" ? <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">有效至 <input required={!item.review_at} name="valid_until" type="datetime-local" className="mt-1 block w-full border px-2 py-1"/></label><label className="text-xs">复核时间 <input required={!item.valid_until} name="review_at" type="datetime-local" className="mt-1 block w-full border px-2 py-1"/></label></div> : null}<button disabled={pending} className="w-fit border px-3 py-1.5 text-sm disabled:opacity-50">建立更正版本</button></form>}</details> : null}
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
