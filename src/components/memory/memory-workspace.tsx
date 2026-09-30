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
  const control = "h-9 w-full rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[12.5px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]";
  const textArea = "min-h-20 w-full resize-y rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 py-2.5 text-[12.5px] leading-5.5 text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]";
  const stateLabel: Record<string,string> = { active:"有效", superseded:"已更新", archived:"已归档", current:"当前", stale:"待复核", expired:"已过期" };
  const visibilityLabel: Record<string,string> = { normal:"AI 可使用", sensitive:"敏感", never:"不用于 AI" };

  return (
    <section>
      <nav className="mb-5 flex items-center gap-5 border-b border-[var(--separator)]" aria-label="记忆类型">
        {(["profile", "working", "decisions"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`relative h-8 text-[11.5px] font-medium transition-colors ui-transition after:absolute after:inset-x-0 after:bottom-0 after:h-px ${tab === item ? "text-[var(--text-primary)] after:bg-[var(--accent)]" : "text-[var(--text-tertiary)] after:bg-transparent hover:text-[var(--text-primary)]"}`}
          >
            {item === "profile" ? "长期事实" : item === "working" ? "当前状态" : "决定"}
          </button>
        ))}
      </nav>

      <details className="mb-5 border-y border-[var(--separator)] py-3">
        <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[11.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">
          从 Codex 导入个人上下文
        </summary>
        <p className="mt-2 max-w-3xl text-[11.5px] leading-5 text-[var(--text-secondary)]">
          只接收结构化事实、偏好、目标和当前状态；先预览，再确认写入。
        </p>
        <textarea
          value={importText}
          onChange={(event) => { setImportText(event.target.value); setImportPreview(null); }}
          maxLength={200000}
          placeholder="粘贴 Codex 导出的 Memory JSON"
          className={`mt-2.5 min-h-28 max-w-3xl font-mono text-[11px] ${textArea}`}
        />
        <div className="mt-2.5 flex items-center gap-2">
          <button type="button" disabled={!importText.trim() || pending} onClick={previewImport} className="pressable h-8 rounded-[8px] bg-[var(--surface-control)] px-2.5 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-control-hover)] disabled:opacity-50">预览</button>
          {importPreview ? <button type="button" disabled={pending} onClick={confirmImport} className="pressable h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-white disabled:opacity-50">{pending ? "导入中…" : `确认导入 ${importPreview.items.length} 条`}</button> : null}
        </div>
        {importPreview ? (
          <div className="mt-3 max-w-3xl divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
            {importPreview.items.map((item) => (
              <article key={item.memoryKey} className="py-2.5">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-[12.5px] font-medium text-[var(--text-primary)]">{item.title}</h3>
                  <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--text-tertiary)]">{item.memoryType === "profile" ? "长期事实" : "当前状态"} · {item.confidence}%</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-5 text-[var(--text-secondary)]">{item.content}</p>
              </article>
            ))}
          </div>
        ) : null}
      </details>

      <form action={tab === "decisions" ? createDecision : (form) => createMemory(tab, form)} className="grid max-w-3xl gap-2.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4">
        <input name="title" required maxLength={tab === "decisions" ? 200 : 160} placeholder={tab === "decisions" ? "决定标题" : "标题"} className={control} />
        <textarea name={tab === "decisions" ? "decision_text" : "content"} required placeholder={tab === "decisions" ? "我决定……" : "只保存你确认的重要信息。"} className={textArea} />
        {tab === "decisions" ? (
          <>
            <textarea name="rationale" placeholder="理由（可选）" className={`${textArea} min-h-16`} />
            <select name="importance" defaultValue="normal" className={control}><option value="low">低重要性</option><option value="normal">普通重要性</option><option value="high">高重要性</option></select>
          </>
        ) : tab === "working" ? (
          <div className="grid gap-2.5 md:grid-cols-2">
            <label className="grid gap-1.5 text-[10.5px] font-medium text-[var(--text-secondary)]">有效至<input type="datetime-local" name="valid_until" className={control} /></label>
            <label className="grid gap-1.5 text-[10.5px] font-medium text-[var(--text-secondary)]">复核时间<input type="datetime-local" name="review_at" className={control} /></label>
          </div>
        ) : null}
        <select name="ai_visibility" defaultValue="normal" className={control}><option value="normal">AI 可正常使用</option><option value="sensitive">敏感：仅明确相关时使用</option><option value="never">永不发送给 AI</option></select>
        <button disabled={pending} className="pressable h-9 w-fit rounded-[9px] bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {pending ? "保存中…" : tab === "decisions" ? "记录决定" : tab === "profile" ? "添加长期事实" : "添加当前状态"}
        </button>
      </form>

      {message ? <p role="status" className="mt-2.5 text-[11px] text-[var(--text-secondary)]">{message}</p> : null}

      <div className="mt-5 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
        {visible.length ? visible.map((item) => {
          const state = tab === "working" ? getWorkingMemoryState(item as never) : item.status;
          return (
            <article key={String(item.id)} className="py-3.5">
              <div className="flex justify-between gap-4">
                <h2 className="text-[13px] font-medium text-[var(--text-primary)]">{String(item.title)}</h2>
                <span className="shrink-0 text-[10.5px] text-[var(--text-tertiary)]">{stateLabel[String(state)] ?? String(state)} · {visibilityLabel[String(item.ai_visibility)] ?? String(item.ai_visibility)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5.5 text-[var(--text-secondary)]">{String(item.content ?? item.decision_text)}</p>
              {item.created_via === "codex_import" ? <p className="mt-1.5 text-[10.5px] text-[var(--text-tertiary)]">来源：Codex{item.confidence !== undefined ? ` · 置信度 ${String(item.confidence)}%` : ""}</p> : null}
              {item.rationale_markdown ? <p className="mt-1.5 text-[11.5px] leading-5 text-[var(--text-secondary)]">理由：{String(item.rationale_markdown)}</p> : null}
              {item.status === "active" ? (
                <details className="mt-2.5">
                  <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[10.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">{tab === "decisions" ? "反转此决定…" : "更正此记忆…"}</summary>
                  {tab === "decisions" ? (
                    <form action={(form) => reverseDecision(item, form)} className="mt-2.5 grid max-w-2xl gap-2 border-l-2 border-[var(--separator)] pl-3">
                      <input name="title" required defaultValue={`反转：${String(item.title)}`} className={control}/><textarea name="decision_text" required placeholder="现在的新决定" className={textArea}/><textarea name="rationale" placeholder="为什么反转" className={`${textArea} min-h-16`}/><label className="grid gap-1 text-[10.5px] text-[var(--text-secondary)]">下次复核<input name="review_at" type="datetime-local" className={control}/></label><button disabled={pending} className="pressable h-8 w-fit rounded-[8px] bg-[var(--surface-control)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)]">确认反转并保留历史</button>
                    </form>
                  ) : (
                    <form action={(form) => replaceMemory(item, form)} className="mt-2.5 grid max-w-2xl gap-2 border-l-2 border-[var(--separator)] pl-3">
                      <input name="title" required defaultValue={String(item.title)} className={control}/><textarea name="content" required defaultValue={String(item.content)} className={textArea}/><select name="ai_visibility" defaultValue={String(item.ai_visibility)} className={control}><option value="normal">AI 可正常使用</option><option value="sensitive">敏感</option><option value="never">永不发送给 AI</option></select>
                      {tab === "working" ? <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-[10.5px] text-[var(--text-secondary)]">有效至<input required={!item.review_at} name="valid_until" type="datetime-local" className={control}/></label><label className="grid gap-1 text-[10.5px] text-[var(--text-secondary)]">复核时间<input required={!item.valid_until} name="review_at" type="datetime-local" className={control}/></label></div> : null}
                      <button disabled={pending} className="pressable h-8 w-fit rounded-[8px] bg-[var(--surface-control)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)]">建立更正版本</button>
                    </form>
                  )}
                </details>
              ) : null}
            </article>
          );
        }) : <p className="py-9 text-[11.5px] text-[var(--text-tertiary)]">这里只保存你确认过的重要信息。</p>}
      </div>
    </section>
  );
}
