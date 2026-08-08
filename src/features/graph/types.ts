import { z } from "zod";

export const graphEntityTypes = ["experience", "note", "document", "todo_task", "calendar_event", "career_direction", "career_milestone", "career_track", "project"] as const;
export type GraphEntityType = (typeof graphEntityTypes)[number];
export type GraphEntityRef = { type: GraphEntityType; id: string };
export const graphEntityRefSchema = z.object({ type: z.enum(graphEntityTypes), id: z.string().uuid() });
export const graphLinkSchema = z.object({ source: graphEntityRefSchema, target: graphEntityRefSchema, createdVia: z.enum(["manual", "suggestion"]).default("manual"), metadata: z.record(z.string(), z.unknown()).default({}) });
export const graphEntityDefinitions: Record<GraphEntityType, { domain: string; label: string; linkable: boolean }> = {
  experience: { domain: "career", label: "经历", linkable: true }, note: { domain: "notes", label: "笔记", linkable: true }, document: { domain: "files", label: "文件", linkable: true }, todo_task: { domain: "tasks", label: "任务", linkable: true }, calendar_event: { domain: "calendar", label: "日程", linkable: true }, career_direction: { domain: "career", label: "职业方向", linkable: true }, career_milestone: { domain: "career", label: "职业节点", linkable: true }, career_track: { domain: "career", label: "职业路线", linkable: true }, project: { domain: "projects", label: "项目", linkable: true },
};
