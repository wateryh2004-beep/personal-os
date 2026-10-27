// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({generate:vi.fn(),save:vi.fn(),push:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:mocks.push})}));
vi.mock("@/features/reviews/actions",()=>({generateReviewDraft:mocks.generate,completeReview:mocks.save,generateReviewProposals:vi.fn(),readReviewProposalGeneration:vi.fn()}));
vi.mock("@/components/reviews/review-evidence",()=>({ReviewEvidencePanel:()=>null}));
import { ReviewComposer } from "@/components/reviews/review-composer";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { getAiActionRecords } from "@/features/assistant/ai-action-runtime";
import type { ReviewEvidence } from "@/features/reviews/evidence";
const initial={wins:[],friction:[],openLoops:[],changes:[],lessons:[],nextFocus:[],freeReflection:""};
const evidence:ReviewEvidence={reviewType:"daily",periodStart:"2026-10-27",periodEnd:"2026-10-27",timezone:"Asia/Shanghai",generatedAt:"2026-10-27T00:00:00Z",calendar:[],tasksCompleted:[],tasksOpen:[],notes:[],inbox:[],career:[],projects:[],decisions:[]};
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();vi.clearAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();});
const button=(text:string)=>[...host.querySelectorAll("button")].find(value=>value.textContent===text)!;
async function type(index:number,text:string){await act(async()=>{const input=host.querySelectorAll("textarea")[index];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(input,text);input.dispatchEvent(new Event("input",{bubbles:true}));});}
async function mount(period=evidence){await act(async()=>root.render(<ReviewComposer type="daily" evidence={period} initialValue={initial}/>));}
it("continues after unmount, adopts only unchanged fields functionally, preserves raw typing, and saves the frozen period plus actual context",async()=>{
  let release!:(value:unknown)=>void;mocks.generate.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));mocks.save.mockResolvedValue({reviewId:"saved"});
  await mount();await act(async()=>button("基于记录生成草稿").click());const completion=getAiActionRecords()[0].completion;
  await type(0,"  manual wins\n\n");await act(async()=>root.render(null));
  await act(async()=>{release({ok:true,draft:{...initial,wins:["AI wins"],friction:["AI friction"]},coverage:1,sources:[{sourceType:"note",sourceId:"11111111-1111-4111-8111-111111111111"}],period:{periodStart:evidence.periodStart,periodEnd:evidence.periodEnd,timezone:evidence.timezone}});await completion;});
  await mount();expect(host.querySelectorAll("textarea")[0].value).toBe("  manual wins\n\n");
  await act(async()=>{button("采纳进展").click();button("采纳阻力").click();});
  expect(host.querySelectorAll("textarea")[0].value).toBe("  manual wins\n\n");expect(host.querySelectorAll("textarea")[1].value).toBe("AI friction");
  await act(async()=>button("完成复盘").click());expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({period:{periodStart:evidence.periodStart,periodEnd:evidence.periodEnd,timezone:evidence.timezone},structuredData:expect.objectContaining({wins:["  manual wins","",""],friction:["AI friction"]}),generatedWithAi:true,aiContextSources:[{sourceType:"note",sourceId:"11111111-1111-4111-8111-111111111111"}],selectedSources:[]}));
  expect(mocks.generate).toHaveBeenCalledTimes(1);
});
it("does not adopt yesterday's completed draft into the new period",async()=>{
  mocks.generate.mockResolvedValue({ok:true,draft:{...initial,wins:["Old cycle"]},coverage:0,sources:[],period:{periodStart:evidence.periodStart,periodEnd:evidence.periodEnd,timezone:evidence.timezone}});await mount();await act(async()=>{button("基于记录生成草稿").click();await Promise.resolve();});
  await act(async()=>root.render(null));await mount({...evidence,periodStart:"2026-10-28",periodEnd:"2026-10-28"});expect(host.textContent).not.toContain("Old cycle");expect(button("采纳进展")).toBeUndefined();
});
