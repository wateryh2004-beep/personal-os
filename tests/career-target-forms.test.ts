// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Tables } from "@/types/database";
const actions = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/features/career/form-actions", () => ({ submitCareerForm: actions.submit }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
import { TargetForm } from "@/components/career/target-form";
import { AddTargetQuestions } from "@/components/career/target-questions";
let host: HTMLDivElement, root: Root;
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text)!;
const form = () => document.querySelector<HTMLFormElement>('[role="dialog"] form')!;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.clearAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("preserves linked context and full notes on failed editing with a target-specific recovery link",async()=>{
  const target={id:"t",title:"原显示名",context_type:"opportunity",opportunity_id:"linked",career_direction_id:null,application_id:null,organization_snapshot:"示例",role_title_snapshot:"研究",priority:4,status:"paused",default_language:"bilingual",next_interview_at:"2026-10-20T02:00:45.123Z",notes_markdown:"# 完整岗位备注\n\n末尾"} as Tables<"interview_contexts">;
  actions.submit.mockResolvedValue({status:"error",message:"未保存"});
  await act(async()=>root.render(createElement(TargetForm,{target,timezone:"Asia/Shanghai"})));
  await act(async()=>button("编辑面试情境").click());
  const snapshot=new FormData(form());
  expect(snapshot.get("interview_wall_time")).toBe("2026-10-20T10:00");
  expect(snapshot.get("next_interview_at")).toBe(target.next_interview_at);
  expect(snapshot.get("opportunity_id")).toBe("linked");
  await act(async()=>form().dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(actions.submit.mock.calls[0][0]).toBe("updateTargetContext");
  expect(new FormData(form()).get("notes_markdown")).toBe(target.notes_markdown);
  expect(document.activeElement?.getAttribute("role")).toBe("alert");
  expect(document.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe("/career/interview/targets/t");
});
it("offers questions beyond the old eight-row slice while excluding existing preparations and follow-ups",async()=>{
  const questions=Array.from({length:20},(_,i)=>({id:String(i),canonical_prompt:`问题 ${i}`,parent_question_id:i===19?"parent":null}));
  actions.submit.mockResolvedValue({status:"error",message:"保留选择"});
  await act(async()=>root.render(createElement(AddTargetQuestions,{contextId:"target",questions,preparedIds:["0"],unavailable:false})));
  await act(async()=>button("从题库加入").click());
  const select=form().elements.namedItem("question_id") as HTMLSelectElement;
  expect([...select.options].map(o=>o.value)).toContain("18");
  expect([...select.options].map(o=>o.value)).not.toContain("0");
  expect([...select.options].map(o=>o.value)).not.toContain("19");
  select.value="18";
  await act(async()=>form().dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(actions.submit.mock.calls[0][0]).toBe("ensureInterviewPreparation");
  expect(actions.submit.mock.calls[0][1].get("context_id")).toBe("target");
  expect(select.value).toBe("18");
});
