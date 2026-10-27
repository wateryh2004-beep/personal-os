// @vitest-environment jsdom
import React,{act,useRef}from 'react';
import {createRoot}from 'react-dom/client';
import {it,expect,vi}from 'vitest';
const remote=vi.hoisted(()=>({capture:vi.fn(),read:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:remote.refresh})}));
vi.mock('@/features/inbox/actions',()=>({captureInboxIntent:remote.capture,reconcileInboxCaptureIntent:remote.read,reclassifyInboxItem:vi.fn(),readInboxClassificationState:vi.fn()}));
import{InboxAiResumeBoundary}from '@/components/inbox/inbox-ai-continuity';
import{submitCapture}from '@/features/assistant/ai-capture';
import{resumeAiResult}from '@/features/assistant/ai-continuity';
import{clearWorkspaceResources}from '@/lib/workspace-resource-cache';
import{announceNavigationIntent}from '@/features/workflow-continuity/navigation-intent';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
it('a late read for capture A cannot claim that the selected capture B was saved',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();
 remote.capture.mockImplementation(async({intentId}:{intentId:string})=>({status:'needs-check',intentId,message:'unknown'}));
 await submitCapture({intentId:a,content:'Raw A'});await submitCapture({intentId:b,content:'Raw B'});
 let release!:(value:unknown)=>void;remote.read.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const ids:string[]=[];
 function Parent(){const ref=useRef<HTMLDivElement>(null);return <div ref={ref}><InboxAiResumeBoundary rootRef={ref} visibleIds={ids}/></div>;}
 const resume=async(id:string)=>{await act(async()=>{announceNavigationIntent();await resumeAiResult({kind:'inbox-capture',intentId:id});await new Promise(resolve=>setTimeout(resolve,70));});};
 try{
  await act(async()=>root.render(<Parent/>));await resume(a);
  expect(host.querySelector('[data-capture-intent-id]')?.getAttribute('data-capture-intent-id')).toBe(a);
  await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='只核对原提交结果')!.click();});
  await resume(b);expect(host.querySelector('[data-capture-intent-id]')?.getAttribute('data-capture-intent-id')).toBe(b);expect(host.textContent).toContain('Raw B');
  await act(async()=>{release({status:'saved',intentId:a,inboxId:a,classification:'ready'});await Promise.resolve();});
  expect(host.querySelector('[data-capture-intent-id]')?.getAttribute('data-capture-intent-id')).toBe(b);
  expect(host.textContent).not.toContain('原记录已保存至 Inbox，分类状态已核对。');
  expect(host.textContent).toContain('Raw B'); expect(remote.refresh).not.toHaveBeenCalled();
 }finally{await act(async()=>{clearWorkspaceResources();root.unmount();});host.remove();}
});
