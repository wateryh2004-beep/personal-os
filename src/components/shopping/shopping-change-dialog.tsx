"use client";
import {useRef,useState} from "react";
import {z} from "zod";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {useLifeMutation} from "@/components/life/use-life-mutation";
import {quantityFields,type LifeFieldInput,type LifeFieldRow} from "@/features/life/contracts";
import {useLifeDialogFocus} from "@/components/life/use-life-dialog-focus";
import {encodeLifeSubmission,parseLifeSubmission,lifeSubmissionStillCurrent} from "@/features/workflow-continuity/life-submission";
import {useDeclaredFormDraft,readDeclaredDraftFields} from "@/features/workflow-continuity/draft-adapters";
import {DraftRecoveryStatus} from "@/components/workflow-continuity/draft-recovery-status";
import styles from "@/components/life/life-field.module.css";
export type PurchaseChangeItem={id:string;title:string;status:string;quantity?:string|null;quantity_unit?:string|null;mutation_revision?:number};
const quantityLabel=(item:PurchaseChangeItem)=>item.quantity&&item.quantity_unit?`${item.quantity} ${item.quantity_unit}`:"数量未记录";
const statusLabels:Record<string,string>={inbox:"待判断",cooling:"冷静期",ready:"可决定",purchased:"已购买",abandoned:"已放弃"};
const baselineSchema=z.array(z.object({id:z.uuid(),expected_revision:z.number().int().nonnegative()}).strict()).min(1).max(20);
type Props={items:PurchaseChangeItem[];kind:"quantity"|"purchased";onClose:()=>void;onSaved:(rows:LifeFieldRow[],hasNewInput?:boolean)=>void};
export function ShoppingChange(props:Props){const focus=useLifeDialogFocus(),busy=useRef(false);return <Dialog open onOpenChange={open=>{if(busy.current)return false;if(!open)props.onClose();}}><DialogContent {...focus}><ShoppingChangeBody {...props} onBusy={value=>{busy.current=value;}}/></DialogContent></Dialog>;}
function ShoppingChangeBody({items,kind,onClose,onSaved,onBusy}:Props&{onBusy:(busy:boolean)=>void}){
 const mutation=useLifeMutation(),busy=useRef(false);
 const ids=items.map(item=>item.id).sort(),id=ids[0];
 const [quantity,setQuantity]=useState(items.length===1?items[0].quantity??"":""),[unit,setUnit]=useState(items.length===1?items[0].quantity_unit??"":"");
 const [preview,setPreview]=useState(kind==="purchased"),[validation,setValidation]=useState(""),[comparison,setComparison]=useState<LifeFieldRow[]|null>(null);
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID()),[submittedInput,setSubmittedInput]=useState(""),[baseline,setBaseline]=useState<Array<{id:string;expected_revision:number}>|null>(()=>items.map(item=>({id:item.id,expected_revision:item.mutation_revision??1})));
 const operation=kind==="quantity"?"shopping.quantity":"shopping.purchased";
 const {formRef,...draft}=useDeclaredFormDraft({operation,id,itemIds:ids,href:"/shopping",label:kind==="quantity"?"修改采购数量":"确认已购买"},fields=>{
  if(typeof fields.quantity==="string")setQuantity(fields.quantity);if(typeof fields.quantityUnit==="string")setUnit(fields.quantityUnit);
  if(typeof fields.request_id==="string"&&z.uuid().safeParse(fields.request_id).success)setRequestId(fields.request_id);
  if(typeof fields.submitted_input==="string")setSubmittedInput(fields.submitted_input);
  if(typeof fields.baselineRevisions==="string"){try{const parsed=baselineSchema.parse(JSON.parse(fields.baselineRevisions));setBaseline(parsed.map(row=>row.id).sort().join(",")===ids.join(",")?parsed:null);}catch{setBaseline(null);}}
  setPreview(kind==="purchased");
 });
 const title=kind==="quantity"?`修改${items.length>1?"所选":""}数量`:"确认已购买";
 async function confirm(){
  if(busy.current)return;
  if(!baseline||mutation.pending){setValidation("原选择或版本无法核对，输入仍保留，请重新读取原记录。");return;}
  busy.current=true;onBusy(true);try{
  const current=draft.captureGuard();if(!current())return;
  let input:LifeFieldInput;
  if(submittedInput){const restored=parseLifeSubmission(submittedInput,operation,kind==="quantity"?"shopping_quantity":"shopping_purchased",ids);if(!restored){setValidation("原提交信息不完整，草稿仍保留。");return;}input=restored.input;
   const outcome=await mutation.reconcile(input);if(!current()||!outcome)return;
   if(outcome.status!=="saved"){setValidation(outcome.status==="rejected"?"原提交与版本不一致，草稿仍保留，请核对原记录。":outcome.status==="missing"?"尚未核对到原操作，草稿与编号仍保留，未重复发送。":"原操作结果仍待确认，未重复发送。");return;}
   if(outcome.receiptStatus==="undone"){setValidation("原操作曾已保存，之后已撤回；当前未重新保存。请核对记录。");return;}
   complete({...restored.fields,submitted_input:submittedInput},outcome.rows);return;
  }
  input=kind==="quantity"?{requestId,operation:"shopping_quantity",items:baseline.map(row=>({...row,quantity,quantity_unit:unit}))}:{requestId,operation:"shopping_purchased",items:baseline};
  const raw=draft.capture(),encoded=encodeLifeSubmission(input,raw),snapshot={...raw,submitted_input:encoded};setSubmittedInput(encoded);draft.setValue(snapshot);
  const rows=await mutation.save(input,kind==="quantity"?`已更新 ${items.length} 项数量`:`已标记 ${items.length} 项为已购买`);
  if(!current())return;if(rows)complete(snapshot,rows);
  }finally{busy.current=false;onBusy(false);}
 }
 function complete(snapshot:import("@/features/workflow-continuity/draft-contracts").DraftFields,rows:LifeFieldRow[]){
  const currentFields=formRef.current?readDeclaredDraftFields(formRef.current,operation):{};delete currentFields.submitted_input;const expected={...snapshot};delete expected.submitted_input;const unchanged=Boolean(formRef.current)&&JSON.stringify(currentFields)===JSON.stringify(expected);
  const next=baselineSchema.safeParse(ids.map(id=>({id,expected_revision:rows.find(row=>row.id===id)?.mutation_revision})));
  if(!next.success){setValidation("原操作已保存，部分记录的当前版本仍不可读，输入仍保留。");return;}
  const original=typeof snapshot.submitted_input==="string"?parseLifeSubmission(snapshot.submitted_input,operation,kind==="quantity"?"shopping_quantity":"shopping_purchased",ids):null;
  if(!original||!lifeSubmissionStillCurrent(original.input,rows)){setComparison(rows);setValidation("原操作曾保存，当前记录已有后续变化。请比较后明确采用当前版本；原输入和提交编号仍保留。");return;}
  const nextRequest=crypto.randomUUID();draft.complete(snapshot,{savedFields:{submitted_input:"",request_id:nextRequest,baselineRevisions:JSON.stringify(next.data)}});setSubmittedInput("");setRequestId(nextRequest);setBaseline(next.data);if(!unchanged){setPreview(false);setValidation("原修改已保存，当前新输入尚未保存。");}if(unchanged)onSaved(rows);else onSaved(rows,true);
 }

 return <><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{preview?"核对影响后确认。恢复草稿不会自动保存。":"数量和单位由你明确填写。"}</DialogDescription></DialogHeader><form noValidate={Boolean(submittedInput)} ref={formRef} {...draft.attributes} onInputCapture={draft.capture} onChangeCapture={draft.capture} onSubmit={event=>{event.preventDefault();if(preview||submittedInput){void confirm();return;}const parsed=quantityFields.safeParse({quantity,quantity_unit:unit});if(!parsed.success){setValidation("请填写大于零的数量和单位，最多三位小数。");return;}setPreview(true);}}>
  <input type="hidden" name="baselineRevisions" value={JSON.stringify(baseline??[])}/><input type="hidden" name="request_id" value={requestId}/><input type="hidden" name="submitted_input" value={submittedInput}/>
  {kind==="quantity"?<div hidden={preview} inert={preview} className={styles.fields}><label className={styles.field}>数量<input name="quantity" value={quantity} required inputMode="decimal" onChange={event=>setQuantity(event.target.value)}/></label><label className={styles.field}>单位<input name="quantityUnit" value={unit} required maxLength={24} onChange={event=>setUnit(event.target.value)}/></label></div>:null}
  {preview?<ul className={styles.preview}>{items.map(item=><li key={item.id}><strong>{item.title}</strong><p>{kind==="quantity"?`${quantityLabel(item)} → ${quantity} ${unit}`:`${statusLabels[item.status]??item.status} → 已购买`}</p></li>)}</ul>:null}
  <DraftRecoveryStatus dirty={draft.dirty} restored={draft.restored} recoveryUnavailable={draft.recoveryUnavailable}/>{validation||mutation.error?<p role="alert" className={styles.error}>{validation||mutation.error}</p>:null}{comparison?<div><p>当前记录</p><ul>{comparison.filter(row=>ids.includes(String(row.id))).map(row=><li key={String(row.id)}>{items.find(item=>item.id===row.id)?.title}：{kind==="quantity"?`${row.quantity??"未记录"} ${row.quantity_unit??""}`:statusLabels[String(row.status)]??String(row.status)} · 版本 {row.mutation_revision}</li>)}</ul><Button type="button" variant="outline" onClick={()=>{const next=baselineSchema.safeParse(ids.map(id=>({id,expected_revision:comparison.find(row=>row.id===id)?.mutation_revision})));if(!next.success)return;const nextRequest=crypto.randomUUID(),raw=draft.capture();draft.setValue({...raw,baselineRevisions:JSON.stringify(next.data),request_id:nextRequest,submitted_input:""});setBaseline(next.data);setRequestId(nextRequest);setSubmittedInput("");setComparison(null);setPreview(kind==="purchased");setValidation("已采用比较后的当前版本，原输入尚未保存。请重新预览确认。");onSaved(comparison,true);}}>采用当前版本，保留输入</Button></div>:null}<div className={styles.actions}><Button variant="outline" type="button" disabled={mutation.pending} onClick={onClose}>取消</Button>{preview&&kind==="quantity"?<Button variant="outline" type="button" disabled={mutation.pending} onClick={()=>setPreview(false)}>返回修改</Button>:null}<Button data-workflow-draft-focus disabled={mutation.pending||!baseline} type="submit">{mutation.pending?"保存中…":submittedInput?"核对原保存":preview?"确认保存":"预览修改"}</Button></div>
 </form></>;
}
