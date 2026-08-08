import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { recordAgentStep, storeAgentAction } from "../persistence";
import {
  careerFactProposalSchema,
  careerMilestoneProposalSchema,
} from "./schemas";
import type { AssistantToolModule } from "./types";

export const careerTools: AssistantToolModule = {
  definitions: [
    { name: "readCareerProfile", group: "career_read", risk: "read", description: "读取职业档案" },
    { name: "searchExperiences", group: "career_read", risk: "read", description: "搜索经历" },
    { name: "readExperience", group: "career_read", risk: "read", description: "读取经历和事实" },
    { name: "listCareerDirections", group: "career_read", risk: "read", description: "读取职业方向" },
    { name: "listCareerMilestones", group: "career_read", risk: "read", description: "读取职业节点" },
    { name: "listCareerOpportunities", group: "career_read", risk: "read", description: "读取机会" },
    { name: "proposeCareerMilestone", group: "career_proposal", risk: "proposal", description: "创建职业节点提案" },
    { name: "proposeCareerFact", group: "career_proposal", risk: "proposal", description: "创建经历事实提案" },
  ],
  build: (context) => ({
    readCareerProfile: tool({
      description: "读取当前用户已确认的职业档案和约束。",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await context.supabase.from("career_profiles").select("professional_headline,career_summary,current_stage,target_graduation_date,target_recruitment_cycle,preferred_locations,preferred_work_types,risk_preferences,constraints_markdown,goals_markdown,updated_at").maybeSingle();
        await recordAgentStep({ ...context, stepType: "tool", toolName: "readCareerProfile", title: "已检查职业档案", summary: data ? "已读取当前职业状态" : "职业档案暂不可用", output: { found: Boolean(data) }, status: error ? "failed" : "succeeded" });
        return { profile: data, unavailable: Boolean(error), source: data ? { domain: "career", title: "职业档案", href: "/career/profile", updatedAt: data.updated_at } : null };
      },
    }),
    searchExperiences: tool({
      description: "按组织、角色或经历内容搜索当前用户的职业经历。",
      inputSchema: z.object({ query: z.string().trim().max(200).default(""), limit: z.number().int().min(1).max(20).default(8) }),
      execute: async ({ query, limit }) => {
        let request = context.supabase.from("experiences").select("id,organization,role,experience_type,start_date,end_date,is_current,status,updated_at").is("archived_at", null).order("start_date", { ascending: false, nullsFirst: false }).limit(limit);
        if (query) request = request.or(`organization.ilike.%${query.replaceAll("%", "\\%")}%,role.ilike.%${query.replaceAll("%", "\\%")}%`);
        const { data, error } = await request;
        await recordAgentStep({ ...context, stepType: "tool", toolName: "searchExperiences", title: "已检查职业经历", summary: error ? "经历暂不可用" : `找到 ${(data ?? []).length} 条经历`, output: { count: (data ?? []).length }, status: error ? "failed" : "succeeded" });
        return { experiences: (data ?? []).map((item) => ({ ...item, href: `/career/experiences/${item.id}` })), unavailable: Boolean(error) };
      },
    }),
    readExperience: tool({
      description: "读取一条属于当前用户的职业经历及其已记录事实；不读取私有证明文件正文。",
      inputSchema: z.object({ experienceId: z.string().uuid() }),
      execute: async ({ experienceId }) => {
        const [experience, facts, outputs] = await Promise.all([
          context.supabase.from("experiences").select("id,organization,department,role,location,start_date,end_date,is_current,background_markdown,raw_description_markdown,status,updated_at").eq("id", experienceId).is("archived_at", null).maybeSingle(),
          context.supabase.from("experience_facts").select("id,fact_type,content,metric_value,metric_unit,occurred_at,verification_status,updated_at").eq("experience_id", experienceId).is("archived_at", null).order("position").limit(30),
          context.supabase.from("experience_outputs").select("id,name,description_markdown,output_type,result_markdown,occurred_at,updated_at").eq("experience_id", experienceId).is("archived_at", null).limit(20),
        ]);
        const unavailable = Boolean(experience.error || facts.error || outputs.error);
        await recordAgentStep({ ...context, stepType: "tool", toolName: "readExperience", title: "已读取职业经历", summary: experience.data?.organization ?? "经历不存在或无权读取", output: { found: Boolean(experience.data), factCount: (facts.data ?? []).length, outputCount: (outputs.data ?? []).length }, status: unavailable || !experience.data ? "failed" : "succeeded" });
        return { experience: experience.data, facts: facts.data ?? [], outputs: outputs.data ?? [], href: experience.data ? `/career/experiences/${experienceId}` : null, unavailable };
      },
    }),
    listCareerDirections: tool({
      description: "读取当前职业方向，保留状态、证据和当前决策的区别。",
      inputSchema: z.object({ includePaused: z.boolean().default(false) }),
      execute: async ({ includePaused }) => {
        let request = context.supabase.from("career_directions").select("id,name,status,priority,hypothesis_markdown,supporting_evidence_markdown,opposing_evidence_markdown,current_decision,review_date,updated_at").is("archived_at", null).order("priority", { ascending: false }).limit(20);
        if (!includePaused) request = request.in("status", ["active", "exploring"]);
        const { data, error } = await request;
        return { directions: data ?? [], href: "/career/directions", unavailable: Boolean(error) };
      },
    }),
    listCareerMilestones: tool({
      description: "读取指定日期范围的职业节点。",
      inputSchema: z.object({ startsOn: z.string().date().optional(), endsOn: z.string().date().optional(), limit: z.number().int().min(1).max(50).default(20) }),
      execute: async ({ startsOn, endsOn, limit }) => {
        let request = context.supabase.from("career_milestones").select("id,title,description,starts_on,target_date,status,importance,track_id,career_direction_id,updated_at").is("archived_at", null).order("target_date").limit(limit);
        if (startsOn) request = request.gte("target_date", startsOn);
        if (endsOn) request = request.lte("target_date", endsOn);
        const { data, error } = await request;
        return { milestones: data ?? [], href: "/career/roadmap", unavailable: Boolean(error) };
      },
    }),
    listCareerOpportunities: tool({
      description: "读取职业机会的安全摘要，不返回完整联系人或敏感 JD。",
      inputSchema: z.object({ status: z.string().trim().max(80).optional(), limit: z.number().int().min(1).max(30).default(12) }),
      execute: async ({ status, limit }) => {
        let request = context.supabase.from("career_opportunities").select("id,organization,role_title,opportunity_type,status,deadline_at,location,work_mode,updated_at").is("archived_at", null).order("deadline_at", { ascending: true, nullsFirst: false }).limit(limit);
        if (status) request = request.eq("status", status);
        const { data, error } = await request;
        return { opportunities: data ?? [], href: "/career/opportunities", unavailable: Boolean(error) };
      },
    }),
    proposeCareerMilestone: tool({
      description: "冻结一个职业路线节点提案。不会直接修改 Career，用户确认后才创建。",
      inputSchema: careerMilestoneProposalSchema,
      execute: async (proposal) => {
        const [track, direction] = await Promise.all([
          context.supabase
            .from("career_tracks")
            .select("id,name")
            .eq("id", proposal.trackId)
            .is("archived_at", null)
            .maybeSingle(),
          proposal.careerDirectionId
            ? context.supabase
                .from("career_directions")
                .select("id,name")
                .eq("id", proposal.careerDirectionId)
                .is("archived_at", null)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (!track.data || track.error || (proposal.careerDirectionId && !direction.data))
          return { proposal: null, actionId: null, error: "职业路线或方向不存在，请重新读取。" };
        return {
          proposal,
          actionId: await storeAgentAction({
            ...context,
            domain: "career",
            actionType: "career.milestone.create",
            payload: proposal,
            preview: {
              title: proposal.title,
              trackName: track.data.name,
              targetDate: proposal.targetDate,
              reason: proposal.reason,
            },
            riskLevel: "medium",
          }),
        };
      },
    }),
    proposeCareerFact: tool({
      description: "冻结一条未验证的 Career 经历事实提案。AI 不能把事实标记为已验证。",
      inputSchema: careerFactProposalSchema,
      execute: async (proposal) => {
        const [experience, document] = await Promise.all([
          context.supabase
            .from("experiences")
            .select("id,organization,role")
            .eq("id", proposal.experienceId)
            .is("archived_at", null)
            .maybeSingle(),
          proposal.sourceDocumentId
            ? context.supabase
                .from("documents")
                .select("id,title")
                .eq("id", proposal.sourceDocumentId)
                .is("archived_at", null)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (!experience.data || experience.error || (proposal.sourceDocumentId && !document.data))
          return { proposal: null, actionId: null, error: "经历或来源文件不存在，请重新读取。" };
        return {
          proposal,
          actionId: await storeAgentAction({
            ...context,
            domain: "career",
            actionType: "career.fact.create",
            payload: proposal,
            preview: {
              title: proposal.content.slice(0, 160),
              experience: [experience.data.organization, experience.data.role].filter(Boolean).join(" · "),
              verificationStatus: "unverified",
              reason: proposal.reason,
            },
            riskLevel: "medium",
          }),
        };
      },
    }),
  }),
};
