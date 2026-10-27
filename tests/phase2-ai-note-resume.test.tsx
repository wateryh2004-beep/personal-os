// @vitest-environment jsdom
import React,{act,useCallback,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
vi.mock('@/components/ai/ai-sidecar',()=>({AISidecar:({children}:{children:React.ReactNode})=><div>{children}</div>}));
import {NoteAiAssistant} from '@/components/notes/note-ai-assistant';
import {resumeAiResult,aiResumeAcknowledgedEvent} from '@/features/assistant/ai-continuity';
import {clearWorkspaceResources} from '@/lib/workspace-resource-cache';
const noteId='11111111-1111-4111-8111-111111111111',runId='22222222-2222-4222-8222-222222222222';
it('the real resume manager and real Note consumer must fetch an exact historical run once, then acknowledge',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();
 let exact=0;const acknowledged:Array<{status:string}>=[];const ack=(event:Event)=>acknowledged.push((event as CustomEvent<{status:string}>).detail);window.addEventListener(aiResumeAcknowledgedEvent,ack);
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  if(url.includes('/api/assistant/runs?noteId='))return Response.json({run:{id:runId},messages:[{id:'m',role:'assistant',parts:[{type:'text',text:'Same exact result'}]}]});
  if(url.includes(`/api/assistant/runs/${runId}?`)){exact++;if(exact>6)return new Promise<Response>(()=>{});return Response.json({messages:[{id:'m',role:'assistant',parts:[{type:'text',text:'Same exact result'}]}]});}
  throw new Error('unexpected request');
 }));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Parent(){const[open,setOpen]=useState(false);const onOpen=useCallback(()=>setOpen(true),[]);return <NoteAiAssistant open={open} onOpen={onOpen} onClose={()=>setOpen(false)} noteId={noteId} title='Title' bodyMarkdown='Body' defaultModel='deepseek-v4-flash' selection={null} onClearSelection={()=>{}} onReplaceNote={()=>false} onInsertNote={()=>false} onReplaceTitle={()=>false}/>;}
 try{
  await act(async()=>root.render(<Parent/>));
  await act(async()=>{await resumeAiResult({kind:'note-history',noteId,runId});await new Promise(resolve=>setTimeout(resolve,150));});
  expect(exact).toBe(1);expect(acknowledged.some(value=>value.status==='accepted')).toBe(true);
 }finally{await act(async()=>{clearWorkspaceResources();root.unmount();});host.remove();window.removeEventListener(aiResumeAcknowledgedEvent,ack);vi.unstubAllGlobals();}
});
function ActualNoteParent(){const[open,setOpen]=useState(false);const onOpen=useCallback(()=>setOpen(true),[]);return <NoteAiAssistant open={open} onOpen={onOpen} onClose={()=>setOpen(false)} noteId={noteId} title='Title' bodyMarkdown='Body' defaultModel='deepseek-v4-flash' selection={null} onClearSelection={()=>{}} onReplaceNote={()=>false} onInsertNote={()=>false} onReplaceTitle={()=>false}/>;}
it('keeps ordinary automatic latest-history loading when no explicit history was selected',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();const fetcher=vi.fn(async()=>Response.json({run:{id:runId},messages:[{id:'latest',role:'assistant',parts:[{type:'text',text:'Ordinary automatic latest history'}]}]}));vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<NoteAiAssistant open onOpen={()=>{}} onClose={()=>{}} noteId={noteId} title='Title' bodyMarkdown='Body' defaultModel='deepseek-v4-flash' selection={null} onClearSelection={()=>{}} onReplaceNote={()=>false} onInsertNote={()=>false} onReplaceTitle={()=>false}/>));await act(async()=>new Promise(resolve=>setTimeout(resolve,40)));expect(host.textContent).toContain('Ordinary automatic latest history');expect(fetcher).toHaveBeenCalledTimes(1);}finally{await act(async()=>{clearWorkspaceResources();root.unmount();});host.remove();vi.unstubAllGlobals();}
});
it('does not install or acknowledge an old exact read after a different target or owner replaces it',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();const nextId='33333333-3333-4333-8333-333333333333';let release!:(response:Response)=>void;
 const fetcher=vi.fn(async(url:string)=>{if(url.includes('/api/assistant/runs?noteId='))return Response.json({run:null,messages:[]});if(url.includes(`/api/assistant/runs/${runId}?`))return new Promise<Response>(resolve=>{release=resolve;});return Response.json({messages:[{id:'newer',role:'assistant',parts:[{type:'text',text:'Explicit selected B history'}]}]});});vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let old!:Promise<Awaited<ReturnType<typeof resumeAiResult>>>;
 try{await act(async()=>root.render(<ActualNoteParent/>));await act(async()=>{old=resumeAiResult({kind:'note-history',noteId,runId});await new Promise(resolve=>setTimeout(resolve,20));});await act(async()=>{await resumeAiResult({kind:'note-history',noteId,runId:nextId});await new Promise(resolve=>setTimeout(resolve,60));});await act(async()=>{release(Response.json({messages:[{id:'old',role:'assistant',parts:[{type:'text',text:'Late unselected A history'}]}]}));await old;});expect(host.textContent).toContain('Explicit selected B history');expect(host.textContent).not.toContain('Late unselected A history');
 await act(async()=>{clearWorkspaceResources();});expect(host.textContent).not.toContain('Explicit selected B history');expect(fetcher.mock.calls.filter(([url])=>url.includes(`/api/assistant/runs/${runId}?`))).toHaveLength(1);
 }finally{await act(async()=>{clearWorkspaceResources();root.unmount();});host.remove();vi.unstubAllGlobals();}
});
