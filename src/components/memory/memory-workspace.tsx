"use client";
import {DraftForm,type DraftSaveResult} from "@/components/workflow-continuity/draft-form";
import {OrdinaryOutcomeRecovery} from "@/components/workflow-continuity/ordinary-outcome-recovery";
import {DraftRecoveryStatus} from "@/components/workflow-continuity/draft-recovery-status";
import {useDraftResumeOpeners,draftResumeKey} from "@/features/workflow-continuity/draft-resume";
import {useWorkflowDraft} from "@/features/workflow-continuity/drafts";
import {captureWorkspaceScope} from "@/lib/workspace-resource-cache";
import {z} from "zod";
import { useEffect,useRef,useState, useTransition } from "react";
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
  const importDraft=useWorkflowDraft({kind:"capture",id:"memory-import",label:"未导入的个人上下文",resumeHref:"/memory",resumeTarget:{kind:"memory.import",id:"owner"},initialValue:{importText:""},parse:input=>{const parsed=z.object({importText:z.string().max(200000)}).strict().safeParse(input);return parsed.success?parsed.data:null;}});
  const importText=importDraft.value.importText,setImportText=(importText:string)=>importDraft.setValue({importText});
  const importBusy=useRef(false);
  const importMounted=useRef(true);useEffect(()=>{importMounted.current=true;return()=>{importMounted.current=false;};},[]);
  const [importPreview, setImportPreview] =
    useState<CodexMemoryImportDocument | null>(null);
  const createMemory = async(type: "profile" | "working", form: FormData):Promise<DraftSaveResult> => {
      try {
        await createPersonalMemoryAction({
          memoryType: type,
          title: form.get("title"),
          content: form.get("content"),
          aiVisibility: form.get("ai_visibility"),
          validUntil: form.get("valid_until") || null,
          reviewAt: form.get("review_at") || null,
        });
        return {status:"saved"};
      } catch (error) {
        return {status:"needs-check",message:error instanceof Error?error.message:"无法确认保存结果，输入保留，请先核对。"};
      }
    };
  const createDecision = async(form: FormData):Promise<DraftSaveResult> => {
      try {
        await createDecisionAction({
          title: form.get("title"),
          decisionText: form.get("decision_text"),
          rationaleMarkdown: form.get("rationale"),
          contextMarkdown: "",
          importance: form.get("importance"),
          aiVisibility: form.get("ai_visibility"),
        });
        return {status:"saved"};
      } catch (error) {
        return {status:"needs-check",message:error instanceof Error?error.message:"无法确认保存结果，输入保留，请先核对。"};
      }
    };
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
  const confirmImport = () => {
    if(!importDraft.isCurrent()||importBusy.current||importDraft.uncertain||!importPreview)return;const snapshot={importText},preview=importPreview,scope=captureWorkspaceScope(),current=()=>importDraft.isCurrent()&&scope()&&importMounted.current;importBusy.current=true;
    start(async () => {
      try {
        const result = await importCodexMemoriesAction(preview);
        if(!current())return;
        setMessage(
          `Codex 上下文已同步：新增 ${result.created} 条，更新 ${result.superseded} 条，确认未变化 ${result.verified} 条。`,
        );
        importDraft.commit(snapshot,before=>({importText:before.importText===snapshot.importText?"":before.importText}));
        setImportPreview(null);
      } catch (error) {
        if(current()){importDraft.markUncertain();setMessage(error instanceof Error ? error.message : "无法导入上下文。");}
      }finally{importBusy.current=false;}
    });};
  const replaceMemory = async(item:Record<string,unknown>,form:FormData):Promise<DraftSaveResult>=>{try{await replacePersonalMemoryAction({memoryId:item.id,memoryType:item.memory_type,title:form.get("title"),content:form.get("content"),aiVisibility:form.get("ai_visibility"),validUntil:form.get("valid_until")||null,reviewAt:form.get("review_at")||null});return{status:"saved"};}catch(error){return{status:"needs-check",message:error instanceof Error?error.message:"无法确认替换结果，原输入已保留。"};}};
  const reverseDecision=async(item:Record<string,unknown>,form:FormData):Promise<DraftSaveResult>=>{try{await reverseDecisionAction({decisionId:item.id,title:form.get("title"),decisionText:form.get("decision_text"),rationaleMarkdown:form.get("rationale"),reviewAt:form.get("review_at")||null});return{status:"saved"};}catch(error){return{status:"needs-check",message:error instanceof Error?error.message:"无法确认反转结果，原输入已保留。"};}};
  useDraftResumeOpeners([{kind:"memory.profile",id:"new"},{kind:"memory.working",id:"new"},{kind:"decision.create",id:"new"},{kind:"memory.import",id:"owner"},...memories.map(item=>({kind:"memory.replace" as const,id:String(item.id)})),...decisions.map(item=>({kind:"decision.reverse" as const,id:String(item.id)}))],target=>{if(target.kind==="memory.import")return;if(target.kind==="decision.create"||target.kind==="decision.reverse"){setTab("decisions");return;}if(target.kind==="memory.working"){setTab("working");return;}if(target.kind==="memory.profile"){setTab("profile");return;}const row=memories.find(item=>item.id===target.id);if(!row)return false;setTab(row.memory_type==="working"?"working":"profile");});
  useEffect(()=>{const reveal=()=>{const id=window.location.hash.replace(/^#decision-/,"");if(!decisions.some(item=>item.id===id))return;setTab("decisions");requestAnimationFrame(()=>{if(window.location.hash===`#decision-${id}`){const node=document.getElementById(`decision-${id}`);node?.scrollIntoView({block:"nearest"});node?.focus({preventScroll:true});}});};const timer=setTimeout(reveal,0);window.addEventListener("hashchange",reveal);return()=>{clearTimeout(timer);window.removeEventListener("hashchange",reveal);};},[decisions]);
  const control = "ui-field h-9 w-full rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[12.5px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]";
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
            className={`relative h-8 text-[12px] font-medium transition-colors ui-transition after:absolute after:inset-x-0 after:bottom-0 after:h-px ${tab === item ? "text-[var(--text-primary)] after:bg-[var(--accent)]" : "text-[var(--text-tertiary)] after:bg-transparent hover:text-[var(--text-primary)]"}`}
          >
            {item === "profile" ? "长期事实" : item === "working" ? "当前状态" : "决定"}
          </button>
        ))}
      </nav>

      <details data-workflow-draft-key={draftResumeKey({kind:"memory.import",id:"owner"})} className="mb-5 border-y border-[var(--separator)] py-3">
        <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">
          从 Codex 导入个人上下文
        </summary>
        <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--text-secondary)]">
          只接收结构化事实、偏好、目标和当前状态；先预览，再确认写入。
        </p>
        <label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">导入个人上下文<textarea
          value={importText}
          onChange={(event) => { setImportText(event.target.value); setImportPreview(null); }}
          maxLength={200000}
          placeholder="粘贴 Codex 导出的 Memory JSON"
          className={`mt-2.5 min-h-28 max-w-3xl font-mono text-[12px] ${textArea}`}
        /></label>
        <div className="mt-2.5 flex items-center gap-2">
          <button type="button" disabled={!importText.trim() || pending} onClick={previewImport} className="pressable h-8 rounded-[8px] bg-[var(--surface-control)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-control-hover)] disabled:opacity-50">预览</button>
          {importPreview ? <button type="button" disabled={pending} onClick={confirmImport} className="pressable h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-[12px] font-medium text-white disabled:opacity-50">{pending ? "导入中…" : `确认导入 ${importPreview.items.length} 条`}</button> : null}
        </div>
        {importDraft.uncertain?<OrdinaryOutcomeRecovery uncertain target={{kind:"memory.import",id:"owner"}} href="/memory" captureGuard={()=>{const scope=captureWorkspaceScope();return()=>scope()&&importMounted.current;}} onCompared={()=>{}}/>:null}<DraftRecoveryStatus dirty={Boolean(importText)} restored={importDraft.restored} recoveryUnavailable={importDraft.recoveryUnavailable}/>
        {importPreview ? (
          <div className="mt-3 max-w-3xl divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
            {importPreview.items.map((item) => (
              <article key={item.memoryKey} className="py-2.5">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-[12.5px] font-medium text-[var(--text-primary)]">{item.title}</h3>
                  <span className="shrink-0 text-[12px] tabular-nums text-[var(--text-tertiary)]">{item.memoryType === "profile" ? "长期事实" : "当前状态"} · {item.confidence}%</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[var(--text-secondary)]">{item.content}</p>
              </article>
            ))}
          </div>
        ) : null}
      </details>

      <DraftForm key={tab} draft={{operation:tab==="decisions"?"decision.create":tab==="working"?"memory.working":"memory.profile",id:"new",href:"/memory",label:tab==="decisions"?"记录决定":"记录记忆"}} action={tab === "decisions" ? createDecision : (form) => createMemory(tab, form)} className="grid max-w-3xl gap-2.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4">
        <label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">标题<input name="title" required maxLength={tab === "decisions" ? 200 : 160} placeholder={tab === "decisions" ? "决定标题" : "标题"} className={control} /></label>
        <label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">内容<textarea name={tab === "decisions" ? "decision_text" : "content"} required placeholder={tab === "decisions" ? "我决定……" : "只保存你确认的重要信息。"} className={textArea} /></label>
        {tab === "decisions" ? (
          <>
            <label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">理由<textarea name="rationale" placeholder="理由（可选）" className={`${textArea} min-h-16`} /></label>
            <label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">重要程度<select name="importance" defaultValue="normal" className={control}><option value="low">低重要性</option><option value="normal">普通重要性</option><option value="high">高重要性</option></select></label>
          </>
        ) : tab === "working" ? (
          <div className="grid gap-2.5 md:grid-cols-2">
            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">有效至<input type="datetime-local" name="valid_until" className={control} /></label>
            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">复核时间<input type="datetime-local" name="review_at" className={control} /></label>
          </div>
        ) : null}
        <label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">AI 可见范围<select name="ai_visibility" defaultValue="normal" className={control}><option value="normal">AI 可正常使用</option><option value="sensitive">敏感：仅明确相关时使用</option><option value="never">永不发送给 AI</option></select></label>
        <button disabled={pending} className="pressable h-9 w-fit rounded-[9px] bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {pending ? "保存中…" : tab === "decisions" ? "记录决定" : tab === "profile" ? "添加长期事实" : "添加当前状态"}
        </button>
      </DraftForm>

      {message ? <p role="status" className="mt-2.5 text-[12px] text-[var(--text-secondary)]">{message}</p> : null}

      <div className="mt-5 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
        {visible.length ? visible.map((item) => {
          const state = tab === "working" ? getWorkingMemoryState(item as never) : item.status;
          return (
            <article id={`${tab==="decisions"?"decision":"memory"}-${String(item.id)}`} tabIndex={-1} key={String(item.id)} className="py-3.5">
              <div className="flex justify-between gap-4">
                <h2 className="text-[13px] font-medium text-[var(--text-primary)]">{String(item.title)}</h2>
                <span className="shrink-0 text-[12px] text-[var(--text-tertiary)]">{stateLabel[String(state)] ?? String(state)} · {visibilityLabel[String(item.ai_visibility)] ?? String(item.ai_visibility)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5.5 text-[var(--text-secondary)]">{String(item.content ?? item.decision_text)}</p>
              {item.created_via === "codex_import" ? <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">来源：Codex{item.confidence !== undefined ? ` · 置信度 ${String(item.confidence)}%` : ""}</p> : null}
              {item.rationale_markdown ? <p className="mt-1.5 text-[12px] leading-5 text-[var(--text-secondary)]">理由：{String(item.rationale_markdown)}</p> : null}
              {item.status === "active" ? (
                <details className="mt-2.5">
                  <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">{tab === "decisions" ? "反转此决定…" : "更正此记忆…"}</summary>
                  {tab === "decisions" ? (
                    <DraftForm draft={{operation:"decision.reverse",id:String(item.id),href:"/memory",label:"反转决定"}} action={(form) => reverseDecision(item, form)} className="mt-2.5 grid max-w-2xl gap-2 border-l-2 border-[var(--separator)] pl-3">
                      <label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">标题<input name="title" required defaultValue={`反转：${String(item.title)}`} className={control}/></label><label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">决定<textarea name="decision_text" required placeholder="现在的新决定" className={textArea}/></label><label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">理由<textarea name="rationale" placeholder="为什么反转" className={`${textArea} min-h-16`}/></label><label className="grid gap-1 text-[12px] text-[var(--text-secondary)]">下次复核<input name="review_at" type="datetime-local" className={control}/></label><button disabled={pending} className="pressable h-8 w-fit rounded-[8px] bg-[var(--surface-control)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)]">确认反转并保留历史</button>
                    </DraftForm>
                  ) : (
                    <DraftForm draft={{operation:"memory.replace",id:String(item.id),href:"/memory",label:"更正记忆"}} action={(form) => replaceMemory(item, form)} className="mt-2.5 grid max-w-2xl gap-2 border-l-2 border-[var(--separator)] pl-3">
                      <label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">标题<input name="title" required defaultValue={String(item.title)} className={control}/></label><label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">内容<textarea name="content" required defaultValue={String(item.content)} className={textArea}/></label><label className="grid min-w-0 gap-2 text-[12px] text-[var(--text-secondary)]">AI 可见范围<select name="ai_visibility" defaultValue={String(item.ai_visibility)} className={control}><option value="normal">AI 可正常使用</option><option value="sensitive">敏感</option><option value="never">永不发送给 AI</option></select></label>
                      {tab === "working" ? <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-[12px] text-[var(--text-secondary)]">有效至<input required={!item.review_at} name="valid_until" type="datetime-local" className={control}/></label><label className="grid gap-1 text-[12px] text-[var(--text-secondary)]">复核时间<input required={!item.valid_until} name="review_at" type="datetime-local" className={control}/></label></div> : null}
                      <button disabled={pending} className="pressable h-8 w-fit rounded-[8px] bg-[var(--surface-control)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)]">建立更正版本</button>
                    </DraftForm>
                  )}
                </details>
              ) : null}
            </article>
          );
        }) : <p className="py-9 text-[12px] text-[var(--text-tertiary)]">这里只保存你确认过的重要信息。</p>}
      </div>
    </section>
  );
}
