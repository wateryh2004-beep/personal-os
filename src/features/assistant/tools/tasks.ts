import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { todoProposalSchema } from "@/features/tasks/schemas";
import { recordAgentStep, storeAgentAction } from "../persistence";
import { todoCompleteProposalSchema, todoDeleteProposalSchema, todoReopenProposalSchema, todoUpdateProposalSchema } from "./schemas";
import type { AssistantToolModule } from "./types";

export const taskTools: AssistantToolModule = {
  definitions: [
    { name: "listTodoLists", group: "todo_read", risk: "read", description: "读取 To Do 清单" },
    { name: "searchTodoTasks", group: "todo_read", risk: "read", description: "查询任务" },
    { name: "proposeTodoCreate", group: "todo_proposal", risk: "proposal", description: "创建任务提案" },
    { name: "proposeTodoTask", group: "todo_proposal", risk: "proposal", description: "创建任务提案（兼容旧名称）" },
    { name: "proposeTodoUpdate", group: "todo_proposal", risk: "proposal", description: "修改任务提案" },
    { name: "proposeTodoDelete", group: "todo_proposal", risk: "proposal", description: "删除任务提案" },
    { name: "proposeTodoComplete", group: "todo_proposal", risk: "proposal", description: "完成任务提案" },
    { name: "proposeTodoReopen", group: "todo_proposal", risk: "proposal", description: "恢复任务提案" },
  ],
  build: (context) => ({
    listTodoLists: tool({
      description: "读取已同步的 Microsoft To Do 清单；创建任务前必须调用。",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await context.supabase
          .from("microsoft_todo_lists")
          .select("id,display_name,is_default")
          .is("archived_at", null)
          .order("display_name")
          .limit(50);
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "listTodoLists",
          title: "已检查任务清单",
          summary: error ? "Microsoft To Do 暂时不可用" : `找到 ${(data ?? []).length} 个清单`,
          output: { count: (data ?? []).length, unavailable: Boolean(error) },
          status: error ? "failed" : "succeeded",
        });
        return { lists: data ?? [], unavailable: Boolean(error) };
      },
    }),
    searchTodoTasks: tool({
      description: "查询当前用户已同步的 Microsoft To Do 任务。",
      inputSchema: z.object({
        query: z.string().trim().max(200).default(""),
        status: z.enum(["notStarted", "inProgress", "waitingOnOthers", "deferred", "completed", "all"]).default("all"),
        dueBefore: z.string().datetime({ offset: true }).nullable().default(null),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ query, status, dueBefore, limit }) => {
        let request = context.supabase
          .from("microsoft_todo_tasks")
          .select("id,title,body_text,status,due_at,importance,completed_at,todo_list_id,provider_last_modified_at,microsoft_todo_lists(display_name)")
          .is("archived_at", null)
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(limit);
        if (status !== "all") request = request.eq("status", status);
        if (dueBefore) request = request.lte("due_at", dueBefore);
        if (query) request = request.or(`title.ilike.%${query.replaceAll("%", "\\%")}%,body_text.ilike.%${query.replaceAll("%", "\\%")}%`);
        const { data, error } = await request;
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "searchTodoTasks",
          title: "已检查任务",
          summary: error ? "Microsoft To Do 暂时不可用" : `找到 ${(data ?? []).length} 个任务`,
          input: { hasQuery: Boolean(query), status, dueBefore },
          output: { count: (data ?? []).length, unavailable: Boolean(error) },
          status: error ? "failed" : "succeeded",
        });
        return { tasks: data ?? [], unavailable: Boolean(error) };
      },
    }),
    proposeTodoCreate: tool({
      description: "冻结一个 Microsoft To Do 创建提案。不会直接创建任务。",
      inputSchema: todoProposalSchema,
      execute: async (proposal) => {
        const { data } = await context.supabase
          .from("microsoft_todo_lists")
          .select("id,display_name")
          .eq("id", proposal.todoListId)
          .is("archived_at", null)
          .maybeSingle();
        if (!data) return { proposal: null, actionId: null, error: "目标清单不存在或尚未同步。" };
        return {
          proposal,
          actionId: await storeAgentAction({
            ...context,
            domain: "tasks",
            actionType: "tasks.create",
            payload: proposal,
            preview: { ...proposal, listName: data.display_name },
            riskLevel: "low",
          }),
        };
      },
    }),
    proposeTodoTask: tool({
      description: "兼容旧名称：冻结 Microsoft To Do 创建提案。",
      inputSchema: todoProposalSchema,
      execute: async (proposal) => {
        const { data } = await context.supabase.from("microsoft_todo_lists").select("id,display_name").eq("id", proposal.todoListId).is("archived_at", null).maybeSingle();
        if (!data) return { proposal: null, actionId: null, error: "目标清单不存在或尚未同步。" };
        return { proposal, actionId: await storeAgentAction({ ...context, domain: "tasks", actionType: "tasks.create", payload: proposal, preview: { ...proposal, listName: data.display_name }, riskLevel: "low" }) };
      },
    }),
    proposeTodoUpdate: tool({
      description: "冻结一条已查询任务的局部修改提案；目标唯一时直接生成提案，不得新建替代任务。",
      inputSchema: todoUpdateProposalSchema,
      execute: async (proposal) => {
        const { data } = await context.supabase.from("microsoft_todo_tasks").select("id,title,status,provider_last_modified_at").eq("id", proposal.taskId).eq("title", proposal.title).eq("status", proposal.expectedStatus).eq("provider_last_modified_at", proposal.expectedLastModifiedAt).is("archived_at", null).maybeSingle();
        if (!data) return { proposal: null, actionId: null, error: "任务已变化或不存在，请重新查询。" };
        return { proposal, actionId: await storeAgentAction({ ...context, domain: "tasks", actionType: "tasks.update", payload: proposal, preview: proposal, riskLevel: "low" }) };
      },
    }),
    proposeTodoDelete: tool({
      description: "冻结删除任务提案；不会直接删除 Microsoft To Do。",
      inputSchema: todoDeleteProposalSchema,
      execute: async (proposal) => {
        const { data } = await context.supabase.from("microsoft_todo_tasks").select("id").eq("id", proposal.taskId).eq("title", proposal.title).eq("status", proposal.expectedStatus).eq("provider_last_modified_at", proposal.expectedLastModifiedAt).is("archived_at", null).maybeSingle();
        if (!data) return { proposal: null, actionId: null, error: "任务已变化或不存在，请重新查询。" };
        return { proposal, actionId: await storeAgentAction({ ...context, domain: "tasks", actionType: "tasks.delete", payload: proposal, preview: proposal, riskLevel: "medium" }) };
      },
    }),
    proposeTodoComplete: tool({
      description: "冻结完成一条已查询任务的提案。不会直接修改 Microsoft To Do。",
      inputSchema: todoCompleteProposalSchema,
      execute: async (proposal) => {
        const { data } = await context.supabase
          .from("microsoft_todo_tasks")
          .select("id,title,status,provider_last_modified_at")
          .eq("id", proposal.taskId)
          .eq("status", proposal.expectedStatus).eq("provider_last_modified_at", proposal.expectedLastModifiedAt)
          .is("archived_at", null)
          .maybeSingle();
        if (!data) return { proposal: null, actionId: null, error: "任务已变化或不存在，请重新查询。" };
        return {
          proposal,
          actionId: await storeAgentAction({
            ...context,
            domain: "tasks",
            actionType: "tasks.complete",
            payload: proposal,
            preview: proposal,
            riskLevel: "low",
          }),
        };
      },
    }),
    proposeTodoReopen: tool({
      description: "冻结恢复一条已完成任务的提案。",
      inputSchema: todoReopenProposalSchema,
      execute: async (proposal) => {
        const { data } = await context.supabase.from("microsoft_todo_tasks").select("id").eq("id", proposal.taskId).eq("title", proposal.title).eq("status", "completed").eq("provider_last_modified_at", proposal.expectedLastModifiedAt).is("archived_at", null).maybeSingle();
        if (!data) return { proposal: null, actionId: null, error: "任务已变化或不存在，请重新查询。" };
        return { proposal, actionId: await storeAgentAction({ ...context, domain: "tasks", actionType: "tasks.reopen", payload: proposal, preview: proposal, riskLevel: "low" }) };
      },
    }),
  }),
};
