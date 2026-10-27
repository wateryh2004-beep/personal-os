"use client";

import {useRef,useState} from "react";
import {FileMutationForm} from "@/components/files/file-mutation-form";
import {FolderPicker} from "./folder-picker";
import {moveNote,renameNote,setNoteAiVisibility} from "@/features/notes/actions";
import {useDraftResumeConsumer,focusDraftForm} from "@/features/workflow-continuity/draft-resume";

export function useNoteMetadataResume(noteId:string,openDetails:()=>void,ready:boolean){
 useDraftResumeConsumer({kind:"note.move",identity:{id:noteId},ready:()=>ready,open:async(target,context)=>{openDetails();return focusDraftForm(target,context);}});
 useDraftResumeConsumer({kind:"note.visibility",identity:{id:noteId},ready:()=>ready,open:async(target,context)=>{openDetails();return focusDraftForm(target,context);}});
}
export function NoteMoveForm({noteId,revision,initialFolderId,folders,onSaved,onPendingChange}:{noteId:string;revision?:number;initialFolderId:string|null;folders:Array<{id:string;name:string;parent_id:string|null}>;onSaved?:()=>void;onPendingChange?:(pending:boolean)=>void}){
 const [folderId,setFolderId]=useState(initialFolderId??"");
 return <FileMutationForm key={noteId} onPendingChange={onPendingChange} draft={{operation:"note.move",id:noteId,href:`/notes/${noteId}`,label:"移动笔记"}} onDraftRestore={fields=>{if(typeof fields.folder_id==="string")setFolderId(fields.folder_id);}} receiptMessage="笔记位置已更新" action={moveNote} onSuccess={onSaved} className="mt-3 grid gap-2.5"><input type="hidden" name="note_id" value={noteId}/><input type="hidden" name="expected_revision" value={revision??""}/><FolderPicker value={folderId} onChange={setFolderId} folders={folders} initialFolderId={initialFolderId} idPrefix={`metadata-${noteId}`}/><button className="pressable min-h-11 justify-self-start rounded-[8px] bg-[var(--accent)] px-2.5 text-xs font-medium text-white">更新位置</button></FileMutationForm>;
}
export function NoteVisibilityForm({noteId,visibility}:{noteId:string;visibility:string}){
 return <FileMutationForm draft={{operation:"note.visibility",id:noteId,href:`/notes/${noteId}`,label:"笔记 AI 可见范围"}} receiptMessage="笔记隐私设置已保存" action={setNoteAiVisibility} className="mt-2.5 flex flex-wrap items-center gap-2"><input type="hidden" name="note_id" value={noteId}/><select aria-label="AI 可见范围" name="ai_visibility" defaultValue={visibility} className="ui-field min-h-11 rounded-[8px] px-2.5 text-xs"><option value="normal">AI 可正常使用</option><option value="sensitive">敏感：默认不发送</option><option value="never">永不发送给 AI</option></select><button className="pressable min-h-11 rounded-[8px] px-2.5 text-xs font-medium text-[var(--accent)]">保存</button></FileMutationForm>;
}

export function NoteRenameForm({noteId,revision,initialTitle,onSaved,onCancel}:{noteId:string;revision?:number;initialTitle:string;onSaved:()=>void;onCancel:()=>void}){
 const [title,setTitle]=useState(initialTitle),cancelled=useRef(false);
 return <FileMutationForm key={noteId} draft={{operation:"note.rename",id:noteId,href:"/notes",label:"笔记重命名"}} onDraftRestore={fields=>{if(typeof fields.title==="string")setTitle(fields.title);}} receiptMessage="笔记标题已保存" action={renameNote} onSuccess={onSaved} className="min-w-0 flex-1"><input type="hidden" name="note_id" value={noteId}/><input type="hidden" name="expected_revision" value={revision??""}/><input name="title" autoFocus required maxLength={240} value={title} onChange={event=>setTitle(event.target.value)} onBlur={event=>{if(cancelled.current)return;if(!title.trim()||title===initialTitle){onCancel();return;}event.currentTarget.form?.requestSubmit();}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancelled.current=true;onCancel();}if(event.key==="Enter"){event.preventDefault();event.currentTarget.form?.requestSubmit();}}} className="h-7 max-md:min-h-11 min-w-0 w-full border-b border-[var(--accent)] bg-transparent px-0 text-[14px] font-medium leading-[22px] text-[var(--text-primary)] outline-none" aria-label="笔记标题"/></FileMutationForm>;
}
