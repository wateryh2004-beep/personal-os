"use server";

import {unstable_rethrow} from "next/navigation";
import type {CareerFormResult} from "@/features/career/form-state";
import {CareerInputError} from "@/features/career/form-state";
import {createInterviewQuestionWithReceipt,updateInterviewQuestion,updateInterviewPreparation,createInterviewAnswerVersionWithReceipt,linkStoryToArchetype,linkInterviewEvidence,createInterviewSessionWithReceipt,completeInterviewSession} from "./actions";
import {selectNarrativeBaselineVersion,confirmNarrativeReference} from "./narrative-actions";

const operations={questionCreate:createInterviewQuestionWithReceipt,questionEdit:updateInterviewQuestion,preparation:updateInterviewPreparation,answer:createInterviewAnswerVersionWithReceipt,storyLink:linkStoryToArchetype,evidenceLink:linkInterviewEvidence,sessionCreate:createInterviewSessionWithReceipt,sessionReview:completeInterviewSession,narrativeBaseline:selectNarrativeBaselineVersion,referenceAck:confirmNarrativeReference};
/** Fixed ordinary operations only. Redirecting legacy entry points remain compatible. */
export async function submitInterviewForm(operation:keyof typeof operations,form:FormData):Promise<CareerFormResult>{
 if(!Object.hasOwn(operations,operation))return {status:"error",message:"无法识别此操作，请重新打开原表单。"};
 try{const receipt=await operations[operation](form);return receipt?{status:"success",message:"已保存。",recordId:receipt.id,redirectTo:receipt.href,...("savedUpdatedAt"in receipt?{savedUpdatedAt:receipt.savedUpdatedAt}:{})}:{status:"success",message:"已保存。"};}
 catch(error){unstable_rethrow(error);return error instanceof CareerInputError?{status:"error",message:error.message,fieldErrors:error.fieldErrors}:{status:"error",needsCheck:true,message:"尚未确认保存结果，输入已保留。请先核对原记录，避免重复保存。"};}
}
