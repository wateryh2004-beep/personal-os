// @vitest-environment jsdom
import React, { act, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const boundary=vi.hoisted(()=>({save:vi.fn(),push:vi.fn(),generate:vi.fn(),resumes:[] as Array<(target:unknown)=>Promise<boolean>>}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:boundary.push})}));
vi.mock('@/features/reviews/actions',()=>({completeReview:boundary.save,generateReviewDraft:boundary.generate,generateReviewProposals:vi.fn(),readReviewProposalGeneration:vi.fn()}));
vi.mock('@/components/reviews/review-evidence',()=>({ReviewEvidencePanel:()=>null}));
vi.mock('@/components/ai/ai-sidecar',()=>({AISidecar:({children}:{children:React.ReactNode})=><div>{children}</div>}));
// Capture only the dispatch boundary; the real NoteAiAssistant callback, fetch,
// local state and automatic open-history effect all execute unchanged.
vi.mock('@/features/assistant/ai-continuity',async importOriginal=>({...await importOriginal<typeof import('@/features/assistant/ai-continuity')>(),registerAiResumeConsumer:(_accepts:unknown,resume:(target:unknown)=>Promise<boolean>)=>{boundary.resumes.push(resume);return()=>{};}}));
import {ReviewComposer} from '@/components/reviews/review-composer';
import {NoteAiAssistant} from '@/components/notes/note-ai-assistant';
import {clearWorkspaceResources} from '@/lib/workspace-resource-cache';
import {getAiActionRecords} from '@/features/assistant/ai-action-runtime';
import {getWorkflowDrafts} from '@/features/workflow-continuity/drafts';
import type {ReviewEvidence} from '@/features/reviews/evidence';
const initial={wins:[],friction:[],openLoops:[],changes:[],lessons:[],nextFocus:[],freeReflection:''};
const evidence:ReviewEvidence={reviewType:'daily',periodStart:'2026-10-27',periodEnd:'2026-10-27',timezone:'Asia/Shanghai',generatedAt:'2026-10-27T00:00:00Z',calendar:[],tasksCompleted:[],tasksOpen:[],notes:[],inbox:[],career:[],projects:[],decisions:[]};
const noteId='11111111-1111-4111-8111-111111111111',runId='22222222-2222-4222-8222-222222222222';
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();vi.clearAllMocks();boundary.resumes.length=0;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();vi.unstubAllGlobals();});
async function type(index:number,text:string){await act(async()=>{const field=host.querySelectorAll('textarea')[index];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(field,text);field.dispatchEvent(new Event('input',{bubbles:true}));});}
it('a completed save for an older period must not navigate the currently mounted new-period editor',async()=>{
 let release!:(value:{reviewId:string})=>void;boundary.save.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 await act(async()=>root.render(<ReviewComposer type='daily' evidence={evidence} initialValue={initial}/>));
 await type(0,'old period text');
 await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='完成复盘')!.click();});
 await act(async()=>root.render(<ReviewComposer type='daily' evidence={{...evidence,periodStart:'2026-10-28',periodEnd:'2026-10-28'}} initialValue={initial}/>));
 await type(0,'new period live text');
 await act(async()=>{release({reviewId:'33333333-3333-4333-8333-333333333333'});await tick();});
 expect(host.querySelectorAll('textarea')[0].value).toBe('new period live text');
 expect(boundary.push).not.toHaveBeenCalled();
});
it('explicit historical Note run must not be replaced by the concurrent automatic latest-history request',async()=>{
 let releaseLatest!:(value:Response)=>void;let latestRequests=0;
 let notifyLatestStarted!:()=>void;
 const latestStarted=new Promise<void>(resolve=>{notifyLatestStarted=resolve;});
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  if(url.includes('/api/assistant/runs?noteId=')){latestRequests++;notifyLatestStarted();return new Promise<Response>(resolve=>{releaseLatest=resolve;});}
  if(url.includes(`/api/assistant/runs/${runId}?`))return Response.json({messages:[{id:'old-msg',role:'assistant',parts:[{type:'text',text:'EXACT OLDER RUN'}]}]});
  throw new Error('unexpected request');
 }));
 function Parent(){const[open,setOpen]=useState(false);const onOpen=useCallback(()=>setOpen(true),[]);return <NoteAiAssistant open={open} onOpen={onOpen} onClose={()=>setOpen(false)} noteId={noteId} title='Title' bodyMarkdown='Body' defaultModel='deepseek-v4-flash' selection={null} onClearSelection={()=>{}} onReplaceNote={()=>false} onInsertNote={()=>false} onReplaceTitle={()=>false}/>;}
 await act(async()=>root.render(<Parent/>));
 let accepted!:Promise<boolean>;
 // Let React commit open before waiting for its effect's automatic request.
 // A fixed delay inside the opening act can expire before that effect is mounted.
 await act(async()=>{accepted=boundary.resumes.at(-1)!({kind:'note-history',noteId,runId});});
 await act(async()=>{await latestStarted;expect(await accepted).toBe(true);});
 expect(latestRequests).toBe(1);expect(host.textContent).toContain('EXACT OLDER RUN');
 await act(async()=>{releaseLatest(Response.json({run:{id:'44444444-4444-4444-8444-444444444444'},messages:[{id:'new-msg',role:'assistant',parts:[{type:'text',text:'UNREQUESTED LATEST RUN'}]}]}));await tick();});
 expect(host.textContent).toContain('EXACT OLDER RUN');
 expect(host.textContent).not.toContain('UNREQUESTED LATEST RUN');
});
it('a save lease also expires across period A to B to A without reusing its old navigation authority',async()=>{
 let release!:(value:{reviewId:string})=>void;boundary.save.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 await act(async()=>root.render(<ReviewComposer type='daily' evidence={evidence} initialValue={initial}/>));
 await type(0,'original A draft');await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='完成复盘')!.click();});
 await act(async()=>root.render(<ReviewComposer type='daily' evidence={{...evidence,periodStart:'2026-10-28',periodEnd:'2026-10-28'}} initialValue={initial}/>));
 await type(0,'B kept draft');await act(async()=>root.render(<ReviewComposer type='daily' evidence={evidence} initialValue={initial}/>));await type(0,'new A live draft');
 await act(async()=>{release({reviewId:'33333333-3333-4333-8333-333333333333'});await tick();});
 expect(host.querySelectorAll('textarea')[0].value).toBe('new A live draft');expect(boundary.push).not.toHaveBeenCalled();
});

it('keeps subsequent same-period input B editable after submission A succeeds without navigating B away',async()=>{
 let release!:(value:{reviewId:string})=>void;boundary.save.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 await act(async()=>root.render(<ReviewComposer type='daily' evidence={evidence} initialValue={initial}/>));
 await type(0,'submitted A');
 await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='完成复盘')!.click();});
 expect(boundary.save).toHaveBeenCalledWith(expect.objectContaining({structuredData:expect.objectContaining({wins:['submitted A']})}));
 await type(0,'live B\n\n');
 await act(async()=>{release({reviewId:'33333333-3333-4333-8333-333333333333'});await tick();});
 expect(host.querySelectorAll('textarea')[0].value).toBe('live B\n\n');
 expect(host.querySelectorAll('textarea')[0].disabled).toBe(false);
 expect(boundary.push).not.toHaveBeenCalled();
 expect(host.textContent).toContain('后续修改尚未保存');
 await type(0,'B remains editable');
 expect(host.querySelectorAll('textarea')[0].value).toBe('B remains editable');
});
it('navigates to the saved review when its whole submitted envelope remains unchanged',async()=>{
 let release!:(value:{reviewId:string})=>void;boundary.save.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 await act(async()=>root.render(<ReviewComposer type='daily' evidence={evidence} initialValue={initial}/>));
 await type(0,'unchanged submission A');
 await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='完成复盘')!.click();});
 await act(async()=>{release({reviewId:'33333333-3333-4333-8333-333333333333'});await tick();});
 expect(boundary.push).toHaveBeenCalledExactlyOnceWith('/reviews/33333333-3333-4333-8333-333333333333');
});

it('retains B as a recoverable edit when it returns to the old initial value while A is being saved',async()=>{
 let release!:(value:{reviewId:string})=>void;boundary.save.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const before={...initial,wins:['initial content']};
 await act(async()=>root.render(<ReviewComposer type='daily' evidence={evidence} initialValue={before}/>));
 await type(0,'submitted A');
 await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='完成复盘')!.click();});
 await type(0,'initial content');
 expect(getWorkflowDrafts().some(draft=>draft.kind==='review')).toBe(false);
 await act(async()=>{release({reviewId:'33333333-3333-4333-8333-333333333333'});await tick();});
 expect(boundary.push).not.toHaveBeenCalled();
 expect(getWorkflowDrafts().some(draft=>draft.kind==='review')).toBe(true);
 await act(async()=>root.render(null));
 await act(async()=>root.render(<ReviewComposer type='daily' evidence={evidence} initialValue={{...initial,wins:['submitted A']}}/>));
 expect(host.querySelectorAll('textarea')[0].value).toBe('initial content');
 expect(boundary.save).toHaveBeenCalledTimes(1);
});
it('keeps a later AI adoption whose body is unchanged but actual context and AI flag are unsaved',async()=>{
 const source={sourceType:'note',sourceId:'55555555-5555-4555-8555-555555555555'};
 boundary.generate.mockResolvedValue({ok:true,draft:initial,coverage:1,sources:[source],period:{periodStart:evidence.periodStart,periodEnd:evidence.periodEnd,timezone:evidence.timezone}});
 let release!:(value:{reviewId:string})=>void;boundary.save.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue({reviewId:'33333333-3333-4333-8333-333333333333'});
 await act(async()=>root.render(<ReviewComposer type='daily' evidence={evidence} initialValue={initial}/>));
 await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='基于记录生成草稿')!.click();await getAiActionRecords()[0].completion;});
 await type(0,'submitted A');
 await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='完成复盘')!.click();});
 expect(boundary.save).toHaveBeenNthCalledWith(1,expect.objectContaining({generatedWithAi:false,aiContextSources:[]}));
 await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='采纳阻力')!.click();});
 expect(host.querySelectorAll('textarea')[0].value).toBe('submitted A');expect(host.querySelectorAll('textarea')[1].value).toBe('');
 await act(async()=>{release({reviewId:'33333333-3333-4333-8333-333333333333'});await tick();});
 expect(boundary.push).not.toHaveBeenCalled();expect(host.textContent).toContain('后续修改尚未保存');
 await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='完成复盘')!.click();});
 expect(boundary.save).toHaveBeenNthCalledWith(2,expect.objectContaining({generatedWithAi:true,aiContextSources:[source],structuredData:expect.objectContaining({wins:['submitted A'],friction:[]})}));
});
