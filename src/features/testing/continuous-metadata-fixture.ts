import "server-only";
import { z } from "zod";
import { metadataCommandSchema } from "@/features/workbench/operation-contracts";
import type { FileRecord } from "@/features/files/queries";
import type { FixtureState } from "./continuous-fixture-state";
import { fixtureTimestamp } from "./continuous-fixture-data";
export type SyntheticMetadataRow = { id: string; title: string; folder_id: string | null; mutation_revision: number; archived_at: string | null; deleted_at: string | null };
export type SyntheticMetadataReceipt = { id: string; requestId: string; payload: string; kind: "note" | "document"; operation: string; before: SyntheticMetadataRow[]; after: SyntheticMetadataRow[]; status: "available" | "undone" };
export const fixtureFileFolderId = "e4100000-0000-4000-8000-000000000001";
export function currentSyntheticFile(state: FixtureState, id: string): FileRecord | null { return state.files.find(file=>file.id===id)??state.uploads.get(id)?.file??null; }
function currentRow(state: FixtureState, kind: "note" | "document", id: string): SyntheticMetadataRow | null {
 const row=kind==="note"?state.notes.find(item=>item.note.id===id)?.note:currentSyntheticFile(state,id);if(!row)return null;
 return {id,title:row.title,folder_id:row.folder_id,mutation_revision:state.metadataRevisions.get(id)??("mutation_revision" in row?row.mutation_revision:undefined)??1,archived_at:row.archived_at,deleted_at:"deleted_at" in row?row.deleted_at:null};
}
function install(state:FixtureState,kind:"note"|"document",row:SyntheticMetadataRow){
 state.metadataRevisions.set(row.id,row.mutation_revision);
 if(kind==="document"){const file=currentSyntheticFile(state,row.id)!;Object.assign(file,{title:row.title,folder_id:row.folder_id,archived_at:row.archived_at,mutation_revision:row.mutation_revision});}
 else{const note=state.notes.find(item=>item.note.id===row.id)!.note;Object.assign(note,{title:row.title,folder_id:row.folder_id,archived_at:row.archived_at,deleted_at:row.deleted_at});}
}
export function syntheticMetadata(state: FixtureState, path: string, raw: unknown): unknown {
 if(path==="metadata-targets"){
  const {kind,ids}=z.object({kind:z.enum(["note","document"]),ids:z.array(z.uuid()).min(1).max(20)}).strict().parse(raw);
  return [...new Set(ids)].map(id=>{const row=currentRow(state,kind,id);if(!row||row.archived_at||row.deleted_at)throw Error("synthetic_missing");return {id:row.id,title:row.title,folder_id:row.folder_id,mutation_revision:row.mutation_revision};});
 }
 if(path==="metadata-receipt-read"){
  const id=z.uuid().parse(raw),receipt=state.metadataReceipts.get(id);if(!receipt)throw Error("synthetic_receipt_missing");
  return receipt.kind==="document"?{kind:"document",rows:receipt.after.map(row=>currentSyntheticFile(state,row.id)).filter(Boolean)}:{kind:"other",rows:[]};
 }
 const input=metadataCommandSchema.parse(raw),payload=JSON.stringify(input),previous=[...state.metadataReceipts.values()].find(row=>row.requestId===input.requestId);
 if(previous)return previous.payload===payload?{status:"success",message:"该合成操作已处理。",receiptId:previous.status==="available"?previous.id:undefined,rows:previous.after}:{status:"conflict",message:"原操作编号已对应其他内容。"};
 if(state.metadataReceipts.size>=100)return{status:"error",message:"合成回执已达上限。"};
 const kind=input.operation.startsWith("file_")?"document":"note",before=input.items.map(item=>currentRow(state,kind,item.id));
 if(before.some((row,i)=>!row||row.archived_at||row.deleted_at||row.mutation_revision!==input.items[i].expectedRevision))return{status:"conflict",message:"记录已有后续修改，整批输入保留。"};
 if(input.items.some(item=>item.folderId&&item.folderId!==fixtureFileFolderId))return{status:"error",message:"目标文件夹不可用。"};
 const after=before.map((old,i)=>({...old!,title:input.operation.endsWith("rename")?input.items[i].title!:old!.title,folder_id:input.operation.endsWith("move")?input.items[i].folderId!:old!.folder_id,archived_at:input.operation.endsWith("archive")?fixtureTimestamp:old!.archived_at,deleted_at:input.operation.endsWith("trash")?fixtureTimestamp:old!.deleted_at,mutation_revision:old!.mutation_revision+1}));
 const receipt:SyntheticMetadataReceipt={id:crypto.randomUUID(),requestId:input.requestId,payload,kind,operation:input.operation,before:structuredClone(before as SyntheticMetadataRow[]),after,status:"available"};for(const row of after)install(state,kind,row);state.metadataReceipts.set(receipt.id,receipt);state.writes[input.operation]=(state.writes[input.operation]??0)+1;
 return{status:"success",message:"合成元数据已保存，可核对撤回。",receiptId:receipt.id,rows:after,requestId:input.requestId};
}
export function previewSyntheticMetadata(state:FixtureState,id:string){const receipt=state.metadataReceipts.get(id);if(!receipt)throw Error("synthetic_receipt_missing");return{receiptId:id,title:receipt.after[0].title,count:receipt.after.length,operation:receipt.operation,status:receipt.status==="undone"?"undone":receipt.after.some(row=>currentRow(state,receipt.kind,row.id)?.mutation_revision!==row.mutation_revision)?"conflict":"available",expiresAt:"2099-01-01T00:00:00Z",timezone:"UTC",provider:false,changes:receipt.after.flatMap((row,i)=>(["title","folder_id","archived_at","deleted_at"] as const).filter(key=>row[key]!==receipt.before[i][key]).map(key=>({label:key,before:String(row[key]??"根目录 / 未设置"),after:String(receipt.before[i][key]??"根目录 / 未设置")})))};}
export function undoSyntheticMetadata(state:FixtureState,id:string){const receipt=state.metadataReceipts.get(id);if(!receipt)return{status:"error",message:"回执不可用。"};if(receipt.status==="undone")return{status:"success",message:"已撤销。",receiptId:id};if(previewSyntheticMetadata(state,id).status!=="available")return{status:"conflict",message:"记录已有后续修改。"};for(const row of receipt.before)install(state,receipt.kind,{...row,mutation_revision:currentRow(state,receipt.kind,row.id)!.mutation_revision+1});receipt.status="undone";state.writes["metadata-undo"]=(state.writes["metadata-undo"]??0)+1;return{status:"success",message:"已撤销。",receiptId:id};}
