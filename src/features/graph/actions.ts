"use server";
import { linkWorkbenchRecords } from "@/features/workbench/operation-links";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { graphLinkSchema } from "./types";

export async function createGraphLink(input: unknown) {
 const value=graphLinkSchema.parse(input);
 const result=await linkWorkbenchRecords({requestId:crypto.randomUUID(),source:value.source,target:value.target});
 if(result.status!=="success") throw new Error(result.message);
 return result;
}
export async function dismissGraphSuggestion(input: unknown) { const value = graphLinkSchema.pick({ source: true, target: true }).parse(input); const { supabase, userId } = await requireOwner(); const { error } = await supabase.from("entity_link_dismissals").upsert({ user_id: userId, source_type: value.source.type, source_id: value.source.id, target_type: value.target.type, target_id: value.target.id }); if (error) throw new Error("无法忽略此建议。"); revalidatePath(`/career/experiences/${value.source.id}`); }
