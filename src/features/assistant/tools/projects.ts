import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { recordAgentStep, storeAgentAction } from "../persistence";
import { projectCreateProposalSchema } from "./schemas";
import type { AssistantToolModule } from "./types";

export const projectTools: AssistantToolModule = {
  definitions: [
    { name: "searchProjects", group: "projects_read", risk: "read", description: "搜索项目" },
    { name: "readProject", group: "projects_read", risk: "read", description: "读取项目" },
    { name: "proposeProjectCreate", group: "projects_proposal", risk: "proposal", description: "创建项目提案" },
  ],
  build: (context) => ({
    searchProjects: tool({
      description: "搜索 Personal OS 项目摘要。",
      inputSchema: z.object({ query: z.string().trim().max(200).default(""), status: z.enum(["active", "on_hold", "completed", "cancelled", "all"]).default("all"), limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ query, status, limit }) => {
        let request = context.supabase.from("projects").select("id,name,description,status,start_date,due_date,completed_at,updated_at,area_id").is("archived_at", null).order("updated_at", { ascending: false }).limit(limit);
        if (status !== "all") request = request.eq("status", status);
        if (query) request = request.or(`name.ilike.%${query.replaceAll("%", "\\%")}%,description.ilike.%${query.replaceAll("%", "\\%")}%`);
        const { data, error } = await request;
        await recordAgentStep({ ...context, stepType: "tool", toolName: "searchProjects", title: "已检查项目", summary: error ? "Projects 暂不可用" : `找到 ${(data ?? []).length} 个项目`, output: { count: (data ?? []).length }, status: error ? "failed" : "succeeded" });
        return { projects: (data ?? []).map((item) => ({ ...item, href: "/projects" })), unavailable: Boolean(error) };
      },
    }),
    readProject: tool({
      description: "读取一条属于当前用户的项目及相关 Notes/Tasks 摘要。",
      inputSchema: z.object({ projectId: z.string().uuid() }),
      execute: async ({ projectId }) => {
        const [project, notes, tasks] = await Promise.all([
          context.supabase.from("projects").select("id,name,description,status,start_date,due_date,completed_at,updated_at").eq("id", projectId).is("archived_at", null).maybeSingle(),
          context.supabase.from("notes").select("id,title,updated_at").eq("project_id", projectId).eq("status", "active").is("deleted_at", null).limit(10),
          context.supabase.from("tasks").select("id,title,status,due_at,priority,updated_at").eq("project_id", projectId).is("archived_at", null).limit(20),
        ]);
        const unavailable = Boolean(project.error || notes.error || tasks.error);
        return { project: project.data, notes: (notes.data ?? []).map((item) => ({ ...item, href: `/notes/${item.id}` })), tasks: tasks.data ?? [], href: project.data ? "/projects" : null, unavailable };
      },
    }),
    proposeProjectCreate: tool({
      description: "冻结新建 Project 提案。不会直接创建；用户在操作卡片确认后才写入。",
      inputSchema: projectCreateProposalSchema,
      execute: async (proposal) => {
        let areaName: string | null = null;
        if (proposal.areaId) {
          const { data: area } = await context.supabase
            .from("areas")
            .select("id,name")
            .eq("id", proposal.areaId)
            .is("archived_at", null)
            .maybeSingle();
          if (!area)
            return { proposal: null, actionId: null, error: "目标 Area 不存在，请重新读取。" };
          areaName = area.name;
        }
        return {
          proposal,
          actionId: await storeAgentAction({
            ...context,
            domain: "projects",
            actionType: "projects.create",
            payload: proposal,
            preview: {
              title: proposal.name,
              description: proposal.description?.slice(0, 500) ?? null,
              areaName,
              dueDate: proposal.dueDate,
              reason: proposal.reason,
            },
            riskLevel: "medium",
          }),
        };
      },
    }),
  }),
};
