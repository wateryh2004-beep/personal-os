"use client";

import { useEffect,useLayoutEffect, useId, useRef, useState, useTransition } from "react";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import { unstable_rethrow } from "next/navigation";
import { CalendarPlus, CheckSquare2, FilePlus2, Inbox, Plane, ShoppingBag, SquareKanban } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createNote } from "@/features/notes/actions";
import { createMicrosoftTodoTaskAction,readMicrosoftTodoCreationAction } from "@/features/tasks/microsoft-todo";
import { createCalendarEvent,readCalendarCreationIntent } from "@/features/calendar/actions";
import {submitPurchaseCreationIntent,readPurchaseCreationIntent} from "@/features/shopping/creation-intents";
import {submitTravelCreationIntent,readTravelCreationIntent} from "@/features/travel/create-intents";
import {submitProjectCreationIntent,readProjectCreationIntent} from "@/features/projects/creation-intents";
import {taskDueInputToIso} from "@/features/tasks/due-time";
import {readGlobalRaw,parseGlobalSubmission,globalSubmissionForm,type GlobalSubmissionKind,type GlobalSubmission} from "@/features/workflow-continuity/global-submission";
import type {CaptureFixtureTransport} from "@/features/assistant/capture-fixtures";
import { useCaptureDraft } from "@/features/workflow-continuity/capture-draft";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { perfMark, perfMeasure } from "@/lib/perf";
import {parseDraftFields,type DraftOperation} from "@/features/workflow-continuity/draft-contracts";
import {draftResumeKey,useDraftResumeOpeners} from "@/features/workflow-continuity/draft-resume";
import {draftValueFingerprint, useWorkflowDraft, type WorkflowDraftKind } from "@/features/workflow-continuity/drafts";
import { announceNavigationIntent } from "@/features/workflow-continuity/navigation-intent";

export type GlobalCreateTransport={task:{submit:typeof createMicrosoftTodoTaskAction;read:typeof readMicrosoftTodoCreationAction};calendar:{submit:typeof createCalendarEvent;read:typeof readCalendarCreationIntent};shopping:{submit:typeof submitPurchaseCreationIntent;read:typeof readPurchaseCreationIntent};travel:{submit:typeof submitTravelCreationIntent;read:typeof readTravelCreationIntent};project:{submit:typeof submitProjectCreationIntent;read:typeof readProjectCreationIntent}};
export type CreateKind = "task" | "calendar" | "note" | "inbox" | "shopping" | "travel" | "project";
export type CreateRequest = { kind?: CreateKind; title?: string };
const options: Array<{ kind: CreateKind; label: string; description: string; icon: typeof CheckSquare2 }> = [
  { kind: "task", label: "新建任务", description: "先写下来，细节稍后补充", icon: CheckSquare2 },
  { kind: "calendar", label: "新建日程", description: "标题、时间即可开始", icon: CalendarPlus },
  { kind: "note", label: "新建笔记", description: "直接进入编辑器", icon: FilePlus2 },
  { kind: "inbox", label: "记录到 Inbox", description: "稍后再决定去向", icon: Inbox },
  { kind: "shopping", label: "加入待购", description: "先捕捉想法，再做判断", icon: ShoppingBag },
  { kind: "travel", label: "添加旅行灵感", description: "记录目的地和一行想法", icon: Plane },
  { kind: "project", label: "新建项目", description: "给正在推进的事一个起点", icon: SquareKanban },
];

function localDateTime(offsetMinutes = 0) {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

/** A thin, global capture surface. It deliberately keeps only primary fields. */
export function GlobalCreateLayer({ creationTransport,captureTransport,initialRequest, contentOnly = false, onClose }: { creationTransport?:GlobalCreateTransport;captureTransport?:CaptureFixtureTransport; initialRequest?: CreateRequest; contentOnly?: boolean; onClose?: () => void }) {
  assertContinuousFixtureTransport(creationTransport);
  const formId = useId();
  const submissionInFlight = useRef<symbol | null>(null);
  const {formRef:captureFormRef,...capture} = useCaptureDraft("global",captureTransport);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [listAttempt, setListAttempt] = useState(0);
  const [open, setOpen] = useState(Boolean(initialRequest));
  const [kind, setKind] = useState<CreateKind | null>(initialRequest?.kind ?? null);
  const kindLease = useRef({kind});
  useLayoutEffect(()=>{kindLease.current={kind};submissionInFlight.current=null;},[kind]);
  const [prefill, setPrefill] = useState(initialRequest?.title ?? "");
  const prefilledCapture = useRef<object | null>(null);
  useEffect(() => { if(kind!=="inbox" || prefilledCapture.current===kindLease.current)return; prefilledCapture.current=kindLease.current; if(prefill && !capture.value)capture.setValue(prefill); },[kind,prefill,capture]);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [lists, setLists] = useState<Array<{ id: string; displayName: string; isDefault: boolean }>>([]);
  const operation:DraftOperation=kind==="task"?"global.task":kind==="calendar"?"global.calendar":kind==="shopping"?"global.shopping":kind==="travel"?"global.travel":kind==="project"?"global.project":"global.inbox";
  const draft = useWorkflowDraft<Record<string, string>>({ kind: (kind === "project" || kind === "inbox" || kind === "note" || !kind ? "capture" : kind) as WorkflowDraftKind, id: `global-create:${kind ?? "chooser"}`, label: options.find(option => option.kind === kind)?.label ?? "快速新建", resumeHref: "/today", resumeTarget:kind&&kind!=="note"&&kind!=="inbox"?{kind:operation,id:"new"}:undefined,createKind: kind ?? undefined, initialValue: {}, parse: value => {const fields=parseDraftFields(operation,value);return fields&&Object.values(fields).every(value=>typeof value==="string")?fields as Record<string,string>:null;} });
  useDraftResumeOpeners(options.filter(option=>option.kind!=="note").map(option=>({kind:`global.${option.kind}` as "global.task"|"global.calendar"|"global.inbox"|"global.shopping"|"global.travel"|"global.project",id:"new"})),target=>{const value=target.kind.slice(7);if(!options.some(option=>option.kind===value))return false;setKind(value as CreateKind);setOpen(true);});
  const [timeDefaults] = useState(() => ({ startsAt: localDateTime(), endsAt: localDateTime(60) }));
  const updateDraftField = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    const defaults: Record<string, string> = kind === "calendar" ? { subject: prefill, starts_at: timeDefaults.startsAt, ends_at: timeDefaults.endsAt } : kind === "task" ? { title: prefill, todo_list_id: lists.find(list => list.isDefault)?.id ?? lists[0]?.id ?? "" } : kind === "inbox" ? { content: prefill } : {};
    draft.setValue(previous => ({ ...defaults, ...previous, [name]: value }));
  };
  useEffect(() => {
    if (!initialRequest) return;
    perfMark("quick-create-open", { kind: initialRequest.kind ?? "chooser" });
  }, [initialRequest]);
  useEffect(() => {
    const show = (event: Event) => { const request = (event as CustomEvent<CreateRequest>).detail; const requested = request?.kind; setKind(requested ?? null); setPrefill(request?.title ?? ""); setMessage(""); setOpen(true); perfMark("quick-create-open", { kind: requested ?? "chooser" }); };
    window.addEventListener("personal-os:create-open", show);
    return () => window.removeEventListener("personal-os:create-open", show);
  }, []);
  useEffect(() => {
    if (!open || kind !== "task") return;
    const controller = new AbortController();
    void fetch("/api/tasks/lists", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const body = await response.json() as { lists?: Array<{ id: string; displayName: string; isDefault: boolean }> };
      setLists(body.lists ?? []);
    }).catch(() => { if (!controller.signal.aborted) setMessage("无法读取任务清单，请稍后重试。"); });
    return () => controller.abort();
  }, [kind, listAttempt, open]);
  const close = () => { setOpen(false); setKind(null); setPrefill(""); onClose?.(); };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionInFlight.current||!draft.isCurrent()) return;
    if (kind === "note") announceNavigationIntent();
    const formNode=event.currentTarget;
    const actualKind=kind as GlobalSubmissionKind;
    const rawInput=kind&&kind!=="note"&&kind!=="inbox"?readGlobalRaw(formNode,actualKind):null;
    let frozen:GlobalSubmission|null=null,readOnly=false;
    if(rawInput){
      if(draft.value.submitted_input){frozen=parseGlobalSubmission(draft.value.submitted_input,actualKind);readOnly=true;if(!frozen){setMessage("原提交信息不完整，输入仍保留，未重新创建。");return;}}
      else{const payload={...rawInput};try{if(kind==="task")payload.due_at=taskDueInputToIso(payload.due_at)??"";if(kind==="calendar"){payload.starts_at=taskDueInputToIso(payload.starts_at)??"";payload.ends_at=taskDueInputToIso(payload.ends_at)??"";}}catch{setMessage("时间无效或存在夏令时歧义，请明确调整后再保存。");return;}const intentId=crypto.randomUUID();frozen={kind:actualKind,intentId,raw:rawInput,entries:[...Object.entries(payload),["request_id",intentId]]};}
    }
    const original=frozen?{...frozen.raw}:null;if(original&&kind==="calendar")delete original.is_all_day;
    const submittedDraft=frozen?{...original,request_id:frozen.intentId,submitted_input:JSON.stringify(frozen)}:draft.value;
    if(frozen&&rawInput){const currentRaw={...rawInput};if(kind==="calendar")delete currentRaw.is_all_day;draft.setValue({...currentRaw,request_id:frozen.intentId,submitted_input:JSON.stringify(frozen)});}
    const form=frozen?globalSubmissionForm(frozen):new FormData(formNode);
    const submissionToken = Symbol(kind ?? "chooser"), instance = kindLease.current, scope = captureWorkspaceScope();
    const current = () => draft.isCurrent() && scope() && mounted.current && kindLease.current === instance;
    submissionInFlight.current = submissionToken;
    setMessage("");
    perfMark("quick-create-submit", { kind });
    start(async () => {
      try {
        if (kind === "note") await createNote();
        else if (kind === "task") {
          const result=readOnly?await(creationTransport?.task.read??readMicrosoftTodoCreationAction)(form):await(creationTransport?.task.submit??createMicrosoftTodoTaskAction)({status:"idle",message:""},form);if(result.status!=="success"){if(current()&&result.writeOutcome==="not_written")draft.setValue(value=>({...value,submitted_input:"",request_id:""}));throw new Error(result.message);}
        } else if (kind === "calendar") {
          const result=readOnly?await(creationTransport?.calendar.read??readCalendarCreationIntent)(form):await(creationTransport?.calendar.submit??createCalendarEvent)({status:"idle",message:""},form);if(result.status!=="success"){if(current()&&result.writeOutcome==="not_written")draft.setValue(value=>({...value,submitted_input:"",request_id:""}));throw new Error(result.message);}
        } else if (kind === "inbox") {
          const result = await capture.submit(String(form.get("content") ?? ""));
          if (!result || result.status !== "saved") { if(current())setMessage(result ? result.message : "这次记录仍在保存，请稍后核对。"); return; }
        } else if(frozen&&kind==="shopping"){
          const result=await(readOnly?creationTransport?.shopping.read??readPurchaseCreationIntent:creationTransport?.shopping.submit??submitPurchaseCreationIntent)(frozen.intentId,frozen.raw);if(result.status!=="saved"){if(result.status==="rejected"&&result.code==="invalid")draft.setValue(value=>({...value,submitted_input:"",request_id:""}));throw new Error(result.message);}
        } else if(frozen&&kind==="travel"){
          const input={kind:"trip" as const,intentId:frozen.intentId,title:frozen.raw.title,description:frozen.raw.description};const result=await(readOnly?creationTransport?.travel.read??readTravelCreationIntent:creationTransport?.travel.submit??submitTravelCreationIntent)(input);if(result.status!=="saved"){if(result.status==="rejected"&&result.code==="invalid")draft.setValue(value=>({...value,submitted_input:"",request_id:""}));throw new Error(result.message);}
        } else if(frozen&&kind==="project"){
          const result=await(readOnly?creationTransport?.project.read??readProjectCreationIntent:creationTransport?.project.submit??submitProjectCreationIntent)(frozen.intentId,frozen.raw);if(result.status!=="saved"){if(result.status==="rejected"&&result.code==="invalid")draft.setValue(value=>({...value,submitted_input:"",request_id:""}));throw new Error(result.message);}
        }
        if (!current()) return;
        perfMeasure("quick-create-confirmed", "quick-create-submit", { kind });
        const unchanged=rawInput?draftValueFingerprint(readGlobalRaw(formNode,actualKind))===draftValueFingerprint(frozen?.raw):kind==="inbox"?String(new FormData(formNode).get("content")??"")===String(form.get("content")??""):true;
        draft.commit(submittedDraft,before=>draftValueFingerprint(before)===draftValueFingerprint(submittedDraft)?{}:{...before,request_id:"",submitted_input:""});
        if(unchanged)close();else setMessage("原输入已保存，当前新输入尚未保存。");
      } catch (error) {
        unstable_rethrow(error);
        if(!current())return;
        setMessage(error instanceof Error && error.message ? error.message : "保存失败，当前输入仍保留。请检查网络后重试。");
      } finally {
        if(submissionInFlight.current===submissionToken)submissionInFlight.current = null;
      }
    });
  };
  const selected = options.find((option) => option.kind === kind);
  const field = (label: string, control: React.ReactNode, optional = false) => (
    <label className="grid gap-1.5 text-[13px] leading-5 text-[var(--text-secondary)]">
      <span>{label}{optional ? <span className="ml-1 text-[12px] text-[var(--text-tertiary)]">（可选）</span> : null}</span>
      {control}
    </label>
  );
  const content = <DialogContent className="sm:max-w-lg">
    {!kind ? <>
      <DialogHeader><DialogTitle>快速新建</DialogTitle><DialogDescription>先记下来，细节稍后补充。</DialogDescription></DialogHeader>
      <div className="grid gap-1">
        {options.map((option) => {
          const Icon = option.icon;
          return <button key={option.kind} type="button" onClick={() => { setMessage(""); setKind(option.kind); }} className="group flex min-h-15 items-center gap-3 rounded-[var(--radius-lg)] px-3.5 text-left transition-colors ui-transition hover:bg-[var(--surface-hover)] active:bg-[var(--surface-selected)]">
            <span className="flex size-8 shrink-0 items-center justify-center text-[var(--accent)]"><Icon className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0"><span className="block text-sm font-medium text-[var(--text-primary)]">{option.label}</span><span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{option.description}</span></span>
          </button>;
        })}
      </div>
    </> : <form ref={kind==="inbox"?captureFormRef:undefined} {...(kind==="inbox"?capture.attributes:{"data-workflow-draft-key":draftResumeKey({kind:operation,id:"new"})})} noValidate={Boolean(draft.value.submitted_input)} onSubmit={submit} aria-busy={pending} aria-describedby={message ? `${formId}-error` : undefined} className="grid gap-4">
      <DialogHeader><DialogTitle>{selected?.label}</DialogTitle><DialogDescription>{selected?.description}</DialogDescription></DialogHeader>
      <fieldset className="grid min-w-0 gap-4 disabled:opacity-70">
        <legend className="sr-only">{selected?.label}内容</legend>
        {kind === "task" ? <>
          {field("任务内容", <Input autoFocus name="title" required maxLength={500} value={draft.value["title"] ?? (prefill)} onChange={updateDraftField} placeholder="写下要做的事" />)}
          {field("清单", <select name="todo_list_id" required value={draft.value["todo_list_id"] ?? (lists.find((list) => list.isDefault)?.id ?? lists[0]?.id ?? "")} onChange={updateDraftField} className="ui-field h-9 rounded-[var(--radius-md)] border bg-[var(--surface-control)] px-3 text-sm"><option value="" disabled>{lists.length ? "选择清单" : message ? "清单暂未读取" : "正在读取清单…"}</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.displayName}</option>)}</select>)}
          {!lists.length && message ? <button type="button" className="min-h-11 justify-self-start text-[13px] text-[var(--accent)]" onClick={() => { setMessage(""); setListAttempt((value) => value + 1); }}>重新读取清单</button> : null}
          {field("截止时间", <Input name="due_at" type="datetime-local" value={draft.value["due_at"] ?? ("")} onChange={updateDraftField} />, true)}
          <input type="hidden" name="body_text" value="" /><input type="hidden" name="importance" value="normal" />
        </> : null}
        {kind === "calendar" ? <>
          {field("日程标题", <Input autoFocus name="subject" required maxLength={500} value={draft.value["subject"] ?? (prefill)} onChange={updateDraftField} placeholder="日程名称" />)}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("开始时间", <Input name="starts_at" type="datetime-local" value={draft.value["starts_at"] ?? timeDefaults.startsAt} onChange={updateDraftField} required />)}
            {field("结束时间", <Input name="ends_at" type="datetime-local" value={draft.value["ends_at"] ?? timeDefaults.endsAt} onChange={updateDraftField} required />)}
          </div>
          <input type="hidden" name="is_all_day" value="false" /><input type="hidden" name="description" value="" />
        </> : null}
        {kind === "note" ? <p className="text-[13px] leading-6 text-[var(--text-secondary)]">创建空白笔记，直接开始编辑。</p> : null}
        {kind === "inbox" ? field("记录内容", <Textarea autoFocus name="content" required maxLength={10000} value={capture.value} onChange={event=>capture.setValue(event.target.value)} placeholder="记下这件事，稍后再决定去向" />) : null}
        {kind === "shopping" ? <>
          {field("物品名称", <Input autoFocus name="title" required value={draft.value["title"] ?? ("")} onChange={updateDraftField} placeholder="想买什么？" />)}
          {field("价格（元）", <Input name="priceCny" inputMode="decimal" maxLength={100} value={draft.value["priceCny"] ?? ("")} onChange={updateDraftField} />, true)}
          <input type="hidden" name="necessity" value="unknown" />
        </> : null}
        {kind === "travel" ? <>
          {field("目的地或旅行主题", <Input autoFocus name="title" required value={draft.value["title"] ?? ("")} onChange={updateDraftField} />)}
          {field("旅行想法", <Textarea name="description" value={draft.value["description"] ?? ("")} onChange={updateDraftField} />, true)}
        </> : null}
        {kind === "project" ? <>
          {field("项目名称", <Input autoFocus name="name" required maxLength={180} value={draft.value["name"] ?? ("")} onChange={updateDraftField} />)}
          {field("项目说明", <Textarea name="description" value={draft.value["description"] ?? ("")} onChange={updateDraftField} />, true)}
          {field("目标日期", <Input name="due_date" type="date" value={draft.value["due_date"] ?? ("")} onChange={updateDraftField} />, true)}
        </> : null}
      </fieldset>
      <div className="min-h-5">
        {draft.scopeRevoked?<p role="status" className="text-xs">工作区已变化，请重新打开此编辑入口。原输入不会作为新工作区的提交。</p>:null}
        {draft.recoveryUnavailable ? <p role="status" className="text-xs text-[var(--warning)]">输入仍在此处，暂时无法在关闭后恢复。</p> : null}
        {message ? <p id={`${formId}-error`} role="alert" className="text-[13px] leading-5 text-[var(--danger)]">{message}</p> : <p role="status" className="text-[12px] text-[var(--text-tertiary)]">{pending ? "正在保存，请稍候…" : ""}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={close}>取消</Button>
        <Button disabled={pending || (kind === "task" && !lists.length)}>{pending ? "正在保存…" : kind === "inbox" ? capture.uncertain ? "核对原记录" : "记录" : draft.value.submitted_input?"核对原提交":"创建"}</Button>
      </div>
    </form>}
  </DialogContent>;
  return contentOnly ? content : <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>{content}</Dialog>;
}
