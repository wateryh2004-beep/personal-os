"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { requireOwner } from "@/lib/auth/require-owner";
import { createInterviewContext } from "@/features/interview/actions";
import * as actions from "./actions";
import { CareerInputError, type CareerFormResult } from "./form-state";

const formActions = {
  saveCareerProfile: actions.saveCareerProfile,
  createSkill: actions.createSkill,
  updateSkill: actions.updateSkill,
  archiveSkill: actions.archiveSkill,
  createDirection: actions.createDirection,
  updateDirection: actions.updateDirection,
  archiveDirection: actions.archiveDirection,
  createCertification: actions.createCertification,
  updateCertification: actions.updateCertification,
  archiveCertification: actions.archiveCertification,

  createFact: actions.createFact,
  createExperience: actions.createExperience,
  prepareOpportunityInterview,
  updateFact: actions.updateFact,
  createOutput: actions.createOutput,
  createBullet: actions.createBullet,
  linkFactToBullet: actions.linkFactToBullet,
  approveBullet: actions.approveBullet,
  uploadEvidence: actions.uploadEvidence,
  archiveExperience: actions.archiveExperience,
  createOpportunity: actions.createOpportunity,
  createOpportunityRequirement: actions.createOpportunityRequirement,
  runGapAnalysis: actions.runGapAnalysis,
  createCareerApplication: actions.createCareerApplication,
  transitionCareerApplication: actions.transitionCareerApplication,
  createResumeVersion: actions.createResumeVersion,
  updateResumeVersion: actions.updateResumeVersion,
  setResumeVersionBullets: actions.setResumeVersionBullets,
  finalizeResumeVersion: actions.finalizeResumeVersion,
  archiveResumeVersion: actions.archiveResumeVersion,
};

/** UI feedback adapter. Every underlying mutation retains its own owner and RLS checks. */
export async function submitCareerForm(operation: keyof typeof formActions, formData: FormData): Promise<CareerFormResult> {
  if (!Object.hasOwn(formActions, operation)) return { status: "error", message: "无法识别此操作，请刷新后重试。" };
  try {
    await formActions[operation](formData);
    return { status: "success", message: "已保存。" };
  } catch (error) {
    // Authentication redirects and framework control flow must never become inline errors.
    unstable_rethrow(error);
    if (error instanceof CareerInputError) return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
    return { status: "error", message: "操作未完成，输入已保留。请检查连接后重试。" };
  }
}

async function prepareOpportunityInterview(formData: FormData) {
  const { supabase } = await requireOwner();
  const opportunityId = String(formData.get("opportunity_id") || "");
  const { data: opportunity, error } = await supabase.from("career_opportunities").select("id,organization,role_title").eq("id", opportunityId).is("archived_at", null).maybeSingle();
  if (error || !opportunity) throw new CareerInputError({}, "该机会暂时不可用，请刷新后重试。");
  const { data: context, error: contextError } = await supabase.from("interview_contexts").select("id,status").eq("opportunity_id", opportunityId).is("archived_at", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (contextError) throw new Error("Unable to load interview context");
  if (context) redirect(context.status === "active" ? `/career/interview?context=${context.id}` : `/career/interview/targets/${context.id}`);
  const contextForm = new FormData();
  contextForm.set("context_type", "opportunity");
  contextForm.set("opportunity_id", opportunity.id);
  contextForm.set("title", `${opportunity.organization} · ${opportunity.role_title}`);
  contextForm.set("organization_snapshot", opportunity.organization);
  contextForm.set("role_title_snapshot", opportunity.role_title);
  contextForm.set("return_to_workspace", "1");
  await createInterviewContext(contextForm);
}
