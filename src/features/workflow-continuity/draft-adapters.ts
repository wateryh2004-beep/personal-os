"use client";

import { useEffect, useLayoutEffect, useRef,useState, type FormEvent } from "react";
import { draftOperationFields, parseDraftFields, type DeclaredDraftConfig, type DraftFields, type DraftOperation } from "./draft-contracts";
import { useWorkflowDraft, type WorkflowDraftKind } from "./drafts";
import { draftResumeKey,isDraftHostReady, focusDraftForm, parseDraftResumeTarget, useDraftResumeConsumer } from "./draft-resume";

export function declaredDraftFieldsFromData(data:FormData,operation:DraftOperation):DraftFields {
 const fields:DraftFields={};for(const [name,definition]of Object.entries(draftOperationFields[operation])){if(definition.type==="many")fields[name]=data.getAll(name).filter((value):value is string=>typeof value==="string");else if(definition.type==="boolean")fields[name]=data.has(name);else {const value=data.get(name);if(typeof value==="string")fields[name]=value;}}return fields;
}
/** Only the fields in the operation's reviewed declaration are read. */
export function readDeclaredDraftFields(form: HTMLFormElement, operation: DraftOperation): DraftFields {
  const fields: DraftFields = {};
  for (const [name, definition] of Object.entries(draftOperationFields[operation])) {
    const control = form.elements.namedItem(name);
    if (!control) continue;
    if (definition.type === "many") {
      const values: string[] = [];
      const controls = control instanceof RadioNodeList ? [...control] : [control];
      for (const item of controls) if (item instanceof HTMLInputElement && item.checked) values.push(item.value);
      fields[name] = values;
    } else if(control instanceof RadioNodeList && definition.type === "text") {
      const selected=[...control].find(item=>item instanceof HTMLInputElement&&item.type==="radio"&&item.checked); if(selected instanceof HTMLInputElement)fields[name]=selected.value;
    } else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
      if (control instanceof HTMLInputElement && (control.type === "file" || control.type === "password")) continue;
      fields[name] = definition.type === "boolean" ? control instanceof HTMLInputElement && control.checked : control.value;
    }
  }
  return fields;
}
export function applyDeclaredDraftFields(form: HTMLFormElement, operation: DraftOperation, fields: DraftFields) {
  for (const [name, definition] of Object.entries(draftOperationFields[operation])) {
    const value = fields[name], control = form.elements.namedItem(name);
    if (value === undefined || !control) continue;
    if (definition.type === "many" && Array.isArray(value)) {
      const controls = control instanceof RadioNodeList ? [...control] : [control];
      for (const item of controls) if (item instanceof HTMLInputElement && item.type === "checkbox") item.checked = value.includes(item.value);
      for(const missing of value.filter(selected=>!controls.some(item=>item instanceof HTMLInputElement&&item.value===selected))){const label=document.createElement("label"),input=document.createElement("input");label.dataset.workflowUnavailableField=name;label.className="flex min-h-11 items-center gap-2 text-xs";input.type="checkbox";input.name=name;input.value=missing;input.checked=true;input.setCustomValidity("原关联目前不可用，请明确取消这项或重新选择。");input.addEventListener("change",()=>input.setCustomValidity(input.checked?"原关联目前不可用，请明确取消这项或重新选择。":""));label.append(input,document.createTextNode("原关联（当前不可用，可取消）"));form.append(label);}
    } else if(control instanceof RadioNodeList && typeof value === "string") {
      for(const item of control)if(item instanceof HTMLInputElement&&item.type==="radio")item.checked=item.value===value;
    } else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
      if (control instanceof HTMLInputElement && (control.type === "file" || control.type === "password" || control.type === "hidden")) continue;
      if (definition.type === "boolean" && control instanceof HTMLInputElement) control.checked = operation === "interview.reference-ack" ? false : value === true;
      else if (typeof value === "string") {
        if(control instanceof HTMLSelectElement&&!Array.from(control.options).some(option=>option.value===value)){const option=document.createElement("option");option.value=value;option.textContent="原选择（当前不可用，请重新选择）";option.disabled=true;option.dataset.workflowUnavailableField=name;control.append(option);control.setCustomValidity("原选择目前不可用，请明确重新选择。");control.addEventListener("change",()=>control.setCustomValidity(control.selectedOptions[0]?.dataset.workflowUnavailableField?"原选择目前不可用，请明确重新选择。":""));}
        control.value = value;
      }
    }
  }
}
export function workflowDraftKind(operation: DraftOperation): WorkflowDraftKind {
  const family = operation.split(".")[0];
  if (["career", "interview", "practice"].includes(family)) return "career";
  if (["task", "calendar", "shopping", "travel", "leisure", "investment"].includes(family)) return family as WorkflowDraftKind;
  return "capture";
}
export function useDeclaredFormDraft(config: DeclaredDraftConfig | undefined, onRestore?: (fields: DraftFields) => void) {
  const formRef = useRef<HTMLFormElement>(null);
  const operation = config?.operation ?? "capture.inbox";
  const validTarget = parseDraftResumeTarget({ kind: operation, id: config?.id ?? "owner", ...(config?.parentId ? { parentId: config.parentId } : {}),...(config?.contextId?{contextId:config.contextId}:{}),...(config?.itemIds?{itemIds:config.itemIds}:{}),...(config?.surface?{surface:config.surface}:{}) });
  const target = validTarget ?? { kind: "capture.inbox" as const, id: "owner" };
  const key = draftResumeKey(target);
  const draft = useWorkflowDraft<DraftFields>({ kind: workflowDraftKind(operation), id: `form:${key}`, label: config?.label ?? "未保存内容", resumeHref: config?.href ?? "/inbox", resumeTarget: config ? validTarget ?? undefined : undefined, initialValue: {}, parse: value => config && validTarget ? parseDraftFields(operation, value) : null });
  const initialized = useRef<{key:string;node:HTMLFormElement}|null>(null);
  const initialFields = useRef<DraftFields>({});
  const [baseline,setBaseline]=useState<DraftFields>({});
  const defaultFields = useRef<DraftFields>({});
  const lease = useRef({ key, token: Symbol(key) });
  useLayoutEffect(()=>{lease.current={key,token:Symbol(key)};},[key]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => {
    const form = formRef.current;
    if (!config || !form || initialized.current?.key === key && initialized.current.node === form) return;
    const remount=initialized.current?.key===key;
    initialized.current = {key,node:form};
    if(!remount){initialFields.current = readDeclaredDraftFields(form, operation);defaultFields.current = initialFields.current;setBaseline(initialFields.current);}
    if (draft.restored || remount) { applyDeclaredDraftFields(form, operation, draft.value); onRestore?.(draft.value); }
    else { const initial = readDeclaredDraftFields(form, operation); draft.commit(draft.value, () => initial); }
  }, [config, key, operation, draft, onRestore]);
  useDraftResumeConsumer({ kind: operation, identity: { id: target.id, parentId: target.parentId,contextId:target.contextId,itemIds:target.itemIds,surface:target.surface }, priority: 2, ready: () => Boolean(config && validTarget && isDraftHostReady(formRef.current)), open: (value, context) => focusDraftForm(value, context) });
  // Controlled hidden props may re-render an older server baseline. Only the
  // explicitly frozen metadata is reapplied; editable fields are never replayed.
  useLayoutEffect(()=>{const form=formRef.current;if(!config||!form)return;for(const name of ["request_id","request_fingerprint","expected_revision","expectedRevision","baselineRevisions","baseline_revision","expected_updated_at","baseline_selected_version_id","original_subject","original_starts_at","original_ends_at","source_task_id","source_task_modified","based_on_answer_id"]){const value=draft.value[name],control=form.elements.namedItem(name);if(typeof value==="string"&&Object.hasOwn(draftOperationFields[operation],name)&&control instanceof HTMLInputElement&&control.type==="hidden")control.value=value;}},[config,operation,draft.value]);
  useLayoutEffect(() => {
    const form=formRef.current;if(!form)return;
    const revoke=(event:Event)=>{if(!draft.isCurrent()){event.preventDefault();event.stopImmediatePropagation();}};
    form.addEventListener("submit",revoke,true);
    return()=>form.removeEventListener("submit",revoke,true);
  });
  function capture(event?: FormEvent<HTMLFormElement>) {
    const form = event?.currentTarget ?? formRef.current;
    if (!config || !form || !draft.isCurrent()) return {};
    const fields = readDeclaredDraftFields(form, operation);
    for(const name of ["expected_revision","expectedRevision","baselineRevisions","baseline_revision","expected_updated_at","baseline_selected_version_id","original_subject","original_starts_at","original_ends_at","source_task_id","source_task_modified","based_on_answer_id"]){const prior=draft.value[name],control=form.elements.namedItem(name);if(typeof prior==="string"&&Object.hasOwn(draftOperationFields[operation],name)&&control instanceof HTMLInputElement&&control.type==="hidden"){fields[name]=prior;control.value=prior;}}
    draft.setValue(fields); return fields;
  }
  return { ...draft, adoptComparedBaseline:(fields:DraftFields)=>{const next={...draft.value,...fields};if(formRef.current)applyDeclaredDraftFields(formRef.current,operation,fields);draft.setValue(next);draft.resolveUncertain();onRestore?.(next);}, clear:()=>{const defaults=defaultFields.current;initialFields.current=defaults;setBaseline(defaults);draft.resolveUncertain();draft.commit(draft.value,()=>defaults);if(formRef.current)applyDeclaredDraftFields(formRef.current,operation,defaults);onRestore?.(defaults);}, formRef, target, key, capture, dirty: JSON.stringify(draft.value) !== JSON.stringify(baseline), attributes: config ? { "data-workflow-draft-key": key } : {}, captureGuard: () => { const current = draft.isCurrent, token = lease.current,node=formRef.current; return () => current() && mounted.current && lease.current === token && formRef.current===node; }, complete: (submitted: DraftFields, options?: { reset?: boolean;savedFields?:DraftFields }) => { const nextBaseline = {...(options?.reset ? defaultFields.current : submitted),...options?.savedFields}; initialFields.current = nextBaseline;setBaseline(nextBaseline); draft.commit(submitted, value => JSON.stringify(value) === JSON.stringify(submitted) ? nextBaseline : {...value,...options?.savedFields}); } };
}
