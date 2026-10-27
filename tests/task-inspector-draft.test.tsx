// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
vi.mock("next/dynamic",()=>({default:()=>()=>null}));
vi.mock("@/features/tasks/microsoft-todo",()=>({}));
vi.mock("@/features/workbench/operation-read-resource",()=>({readWorkbenchTimezone:async()=>null}));
vi.mock("@/components/links/entity-backlinks",()=>({EntityBacklinks:()=>null}));
vi.mock("@/components/links/entity-markdown",()=>({EntityMarkdown:({body}:{body:string})=><p>{body}</p>}));
import {TaskInspector} from "@/components/tasks/task-workspace";
import type {TodoTask} from "@/features/tasks/types";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
import {requestDraftResume,getDraftResumeStatus} from "@/features/workflow-continuity/draft-resume";
import {getWorkflowDrafts} from "@/features/workflow-continuity/drafts";
const id="11111111-1111-4111-8111-111111111111",list="22222222-2222-4222-8222-222222222222";
const task:TodoTask={id,providerTaskId:"original-provider",todoListId:list,title:"Original title",bodyText:"Original body",importance:"normal",status:"notStarted",dueAt:null,completedAt:null,lastModifiedAt:"2026-10-27T01:00:00Z"};
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()});HTMLElement.prototype.scrollIntoView=vi.fn();vi.stubGlobal("requestAnimationFrame",(cb:FrameRequestCallback)=>setTimeout(()=>cb(performance.now()),0));vi.stubGlobal("cancelAnimationFrame",clearTimeout);host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();vi.unstubAllGlobals();});
const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(row=>row.textContent===label)!;
async function title(value:string){await act(async()=>{const input=host.querySelector<HTMLInputElement>('[name="title"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});}
async function enter(){await act(async()=>host.querySelector('[name="title"]')!.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));}
it("actual inspector retains editable title B after A receipt and advances baseline only from canonical receipt",async()=>{
 let finish!:(value:unknown)=>void;const update=vi.fn().mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await act(async()=>root.render(<TaskInspector task={task} list="Synthetic" pending={false} onClose={vi.fn()} update={update} remove={vi.fn()}/>));await act(async()=>button("Original title").click());await title("A");await enter();await title("B");expect(host.querySelector('[name="title"]')!.matches(":disabled")).toBe(false);expect(update.mock.calls[0][1]).toEqual({title:task.title,bodyText:task.bodyText,lastModifiedAt:task.lastModifiedAt,status:task.status});const originalRequest=update.mock.calls[0][2];await act(async()=>finish({status:"success",message:"A saved",rows:[{...task,title:"A",lastModifiedAt:"2026-10-27T02:00:00Z"}]}));expect(host.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("B");expect(host.textContent).toContain("当前新输入尚未保存");expect(getWorkflowDrafts()).toHaveLength(1);await enter();expect(update.mock.calls[1][1]).toEqual({title:"A",bodyText:task.bodyText,lastModifiedAt:"2026-10-27T02:00:00Z",status:task.status});expect(update.mock.calls[1][2]).not.toBe(originalRequest);
});
it("returning to uncertain body restores and focuses the body, then only reads original UUID and baseline",async()=>{
 const update=vi.fn().mockResolvedValue({status:"unknown",message:"Unknown original"});const render=(body:string,modified:string)=>root.render(<TaskInspector task={{...task,bodyText:body,lastModifiedAt:modified}} list="Synthetic" pending={false} onClose={vi.fn()} update={update} remove={vi.fn()}/>);
 await act(async()=>render(task.bodyText!,task.lastModifiedAt!));await act(async()=>button("编辑").click());await act(async()=>{const node=host.querySelector<HTMLTextAreaElement>('[name="body_text"]')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(node,"Original attempt A");node.dispatchEvent(new Event("input",{bubbles:true}));});await act(async()=>host.querySelector('[name="body_text"]')!.dispatchEvent(new FocusEvent("focusout",{bubbles:true})));
 expect(update).toHaveBeenCalledOnce();const frozen=update.mock.calls[0];await act(async()=>root.render(null));await act(async()=>render("Remote B","2026-10-27T09:00:00Z"));await act(async()=>{await requestDraftResume({kind:"task.edit",id});});await vi.waitFor(()=>expect(getDraftResumeStatus().status).toBe("accepted"));expect(document.activeElement).toBe(host.querySelector('[name="body_text"]'));expect(host.querySelector<HTMLTextAreaElement>('[name="body_text"]')!.value).toBe("Original attempt A");await act(async()=>button("核对原保存").click());expect(update.mock.calls[1]).toEqual([frozen[0],frozen[1],frozen[2],true]);
});
