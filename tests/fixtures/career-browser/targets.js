import { home } from "./data";
export function targetFixture(id) {
 const mode=new URLSearchParams(location.search).get("fixture");
 const target={...home.interviewTargets.find(t=>t.id===id),id,context_type:"target",career_direction_id:null,opportunity_id:null,application_id:null,default_language:"bilingual",priority:4,notes_markdown:"# 岗位准备原文\n\n"+"完整保留岗位背景、重点和待核对事项。\n\n".repeat(12)+"末尾保留标记。"};
 const questions=Array.from({length:16},(_,i)=>({id:`q-${i}`,parent_question_id:null,canonical_prompt:i===0?"请完整说明一次解决复杂问题的过程。":i===1?"如何判断数据质量与样本偏差？":`合成岗位问题 ${i+1}：如何理解研究证据与不确定性？`}));
 const preparations=questions.slice(0,4).map((q,i)=>({id:`p-${i}`,question_id:q.id,context_id:id,status:i===0?"ready":i===3?"paused":"developing",next_practice_at:i===2?"2026-10-18T01:00:00Z":null,prompt_override:null}));
 return {target,questions:mode==="empty"?[]:questions,preparations:mode==="empty"?[]:preparations,timezone:"Asia/Shanghai",now:home.now,unavailable:mode==="error"};
}
