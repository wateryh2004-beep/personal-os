"use server";
import {z} from "zod";
import {requireOwner} from "@/lib/auth/require-owner";
import {isNoteAiPromptKey,noteAiDefaultPrompt} from "@/features/notes/ai-prompts";
import {parseDraftFields,type DraftOperation,type DraftFields} from "./draft-contracts";
import type {Database} from "@/types/database";
import {readNarrativeDraftComparison} from "@/features/interview/narrative-actions";
type Definition={table:keyof Database["public"]["Tables"];fields:readonly string[];archived?:boolean;ownerOnly?:boolean};
const definitions:Partial<Record<DraftOperation,Definition>>={
 "career.profile":{table:"career_profiles",ownerOnly:true,fields:["professional_headline","current_stage","target_graduation_date","target_recruitment_cycle","career_summary","preferred_locations","preferred_work_types","risk_preferences","constraints_markdown","goals_markdown"]},
 "career.skill-edit":{table:"skills",archived:true,fields:["name","category","proficiency","last_used_at","evidence_markdown"]},
 "career.certification-edit":{table:"certifications",archived:true,fields:["name","issuer","status","exam_date","issue_date","expiry_date","score","credential_number","document_id","notes_markdown"]},
 "career.direction-edit":{table:"career_directions",archived:true,fields:["name","status","priority","review_date","hypothesis_markdown","current_decision","supporting_evidence_markdown","opposing_evidence_markdown","description"]},
 "career.fact-edit":{table:"experience_facts",archived:true,fields:["content","fact_type","verification_status","metric_value","metric_unit","occurred_at","notes_markdown"]},
 "career.resume-content":{table:"resume_versions",archived:true,fields:["title","version_label","target_direction_id","document_id","content_markdown"]},
 "career.resume-bullets":{table:"resume_versions",archived:true,fields:[]},
 "career.target-edit":{table:"interview_contexts",archived:true,fields:["title","context_type","career_direction_id","opportunity_id","application_id","organization_snapshot","role_title_snapshot","default_language","priority","status","next_interview_at","notes_markdown"]},
 "career.story-edit":{table:"interview_stories",archived:true,fields:["title","status","experience_id","one_line","situation_markdown","task_markdown","action_markdown","result_markdown","reflection_markdown"]},
 "career.track-edit":{table:"career_tracks",archived:true,fields:["name","description","start_date","end_date","status","color"]},
 "career.milestone-edit":{table:"career_milestones",archived:true,fields:["title","description","track_id","career_direction_id","starts_on","target_date","status","importance"]},
 "interview.question-edit":{table:"interview_questions",archived:true,fields:["canonical_prompt","short_title","category","question_style","subcategory","competency_tags","prompt_variants","source_type","source_name","source_url","source_observed_at","source_detail","parent_question_id","follow_up_kind","difficulty"]},
 "interview.preparation":{table:"interview_question_preparations",archived:true,fields:["working_thoughts_markdown","prompt_override","status","importance","target_language","interviewer_intent_markdown","risk_markdown","answer_logic_markdown","key_message","next_focus","confidence","next_practice_at"]},
 "practice.session-review":{table:"interview_sessions",archived:true,fields:["overall_review_markdown","strength_tags","issue_tags","next_focus"]},
 "calendar.category-rules":{table:"calendar_categories",archived:true,fields:["ai_enabled","ai_description","keywords"]},
 "note.folder-rename":{table:"note_folders",archived:true,fields:["name"]},
 "note.rename":{table:"notes",archived:true,fields:["title"]},"note.move":{table:"notes",archived:true,fields:["folder_id"]},"note.visibility":{table:"notes",archived:true,fields:["ai_visibility"]},
 "file.rename":{table:"documents",archived:true,fields:["title"]},"file.move":{table:"documents",archived:true,fields:["folder_id"]},"file.visibility":{table:"documents",archived:true,fields:["ai_visibility"]},
 "settings.prompt":{table:"ai_prompt_overrides",fields:["content"]},
 "settings.ai-governance":{table:"ai_governance_settings",ownerOnly:true,fields:["semantic_retrieval_opt_in","long_term_memory_opt_in","max_context_chars_per_request","max_output_tokens_per_request","daily_call_limit","monthly_call_limit","daily_cost_limit_usd","monthly_cost_limit_usd","estimated_input_cost_per_million_usd","estimated_output_cost_per_million_usd"]},
};
export type OrdinaryComparison={status:"ready";fields:DraftFields;baselines:DraftFields}|{status:"unavailable"|"unsupported";message:string};
/** Fresh owner-only comparison, never proof that an earlier request succeeded. */
export async function readOrdinaryDraftComparison(input:unknown):Promise<OrdinaryComparison>{
 const target=z.object({kind:z.string(),id:z.string().max(512),parentId:z.uuid().optional(),contextId:z.uuid().optional()}).strict().safeParse(input);
 if(target.success&&target.data.kind==="interview.narrative-baseline"&&!target.data.parentId&&!target.data.contextId){try{const row=await readNarrativeDraftComparison(target.data.id);return {status:"ready",fields:{selected_version_id:row.selectedVersionId},baselines:{baseline_selected_version_id:row.selectedVersionId}};}catch{return {status:"unavailable",message:"原母版当前不可读，原选择与待核对状态仍保留。"};}}
 if(!target.success||!Object.hasOwn(definitions,target.data.kind))return {status:"unsupported",message:"原创建或追加的结果仍待核对。查看原清单不会解锁这次重复保存。"};
 const operation=target.data.kind as DraftOperation,definition=definitions[operation]!;
 if(!definition.ownerOnly&&operation!=="settings.prompt"&&!z.uuid().safeParse(target.data.id).success||definition.ownerOnly&&target.data.id!=="owner")return {status:"unavailable",message:"原记录标识不可用，未发送保存。"};
 try{
  const {supabase,userId}=await requireOwner();const versioned=operation==="note.rename"||operation==="note.move"||operation==="file.rename"||operation==="file.move";
  let query=supabase.from(definition.table).select([...definition.fields,...(versioned?["mutation_revision"]:[]),...(operation==="interview.preparation"?["updated_at","question_id","context_id"]:[]),...(operation==="interview.question-edit"?["question_type_id"]:[]),...(operation==="career.resume-bullets"?["id","status"]:[])].join(",")).eq("user_id",userId);
  if(operation==="settings.prompt"){if(!isNoteAiPromptKey(target.data.id))return {status:"unavailable",message:"原提示词不可用。"};query=query.eq("prompt_key",target.data.id);}else if(!definition.ownerOnly)query=query.eq("id",target.data.id);
  if(definition.archived)query=query.is("archived_at",null);
  if(operation==="career.fact-edit"){if(!target.data.parentId)return {status:"unavailable",message:"原经历上下文不可用。"};query=query.eq("experience_id",target.data.parentId);}
  if(definition.table==="notes")query=query.is("deleted_at",null).is("vault_group_id",null);
  if(definition.table==="documents")query=query.eq("storage_provider","cloudflare_r2").eq("storage_state","available").is("vault_group_id",null);
  const result=await query.maybeSingle();if(result.error)return {status:"unavailable",message:"当前原记录暂时无法读取，输入与待核对状态仍保留。"};
  const parsed=z.record(z.string(),z.unknown()).safeParse(result.data);const row=parsed.success?parsed.data:operation==="settings.prompt"&&isNoteAiPromptKey(target.data.id)?{content:noteAiDefaultPrompt(target.data.id)}:null;
  if(!row)return {status:"unavailable",message:"原记录当前不可用，未选择另一条记录。"};
  if(operation==="interview.preparation"&&(row.question_id!==target.data.parentId||(row.context_id??undefined)!==target.data.contextId))return {status:"unavailable",message:"原题目或面试情境已不匹配，输入仍保留。"};
  const fields:DraftFields={};for(const name of definition.fields){const value=row[name];if(value!==null&&value!==undefined&&typeof value!=="string"&&typeof value!=="boolean"&&!(typeof value==="number"&&Number.isFinite(value))&&!(Array.isArray(value)&&value.every(item=>typeof item==="string")))return {status:"unavailable",message:"当前原字段无法准确读取，输入仍保留。"};fields[name]=typeof value==="boolean"?value:Array.isArray(value)?value.filter(item=>typeof item==="string").join(["preferred_locations","preferred_work_types"].includes(name)?"\n":", "):value===null||value===undefined?"":String(value);}
  if(operation==="interview.question-edit"){const type=await supabase.from("interview_question_types").select("key").eq("user_id",userId).eq("id",String(row.question_type_id)).is("archived_at",null).maybeSingle();if(type.error||!type.data)return {status:"unavailable",message:"原问题类型当前不可读，输入仍保留。"};fields.question_type_key=type.data.key;}
  if(operation==="career.resume-bullets"){if(row.status!=="draft")return {status:"unavailable",message:"此简历当前已不能编辑，原选择保留。"};const bullets=await supabase.from("resume_version_bullets").select("bullet_id").eq("user_id",userId).eq("resume_version_id",target.data.id).order("position").limit(201);const checked=z.array(z.object({bullet_id:z.uuid()})).max(200).safeParse(bullets.data);if(bullets.error||!checked.success)return {status:"unavailable",message:"当前简历条目暂不可完整读取，原选择保留。"};fields.bullet_id=checked.data.map(row=>row.bullet_id);}
  const checked=parseDraftFields(operation,fields);if(!checked)return {status:"unavailable",message:"当前原记录超出恢复字段约束，输入仍保留。"};const baselines:DraftFields={};
  if(versioned){const revision=z.number().int().nonnegative().safeParse(row.mutation_revision);if(!revision.success)return {status:"unavailable",message:"当前原版本不可读，输入仍保留。"};baselines.expected_revision=String(revision.data);}
  if(operation==="interview.preparation"){const timestamp=z.string().datetime({offset:true}).safeParse(row.updated_at);if(!timestamp.success)return {status:"unavailable",message:"当前原版本不可读，输入仍保留。"};baselines.expected_updated_at=timestamp.data;}
  if(operation==="interview.narrative-baseline"){const selected=z.uuid().safeParse(row.selected_version_id);if(!selected.success)return {status:"unavailable",message:"当前母版版本不可读，原选择保留。"};baselines.baseline_selected_version_id=selected.data;}
  return {status:"ready",fields:checked,baselines};
 }catch{return {status:"unavailable",message:"原记录读取尚未完成，未发送保存。"};}
}
