import { z } from "zod";
import {
  createCalendarEventSchema,
  deleteCalendarEventSchema,
  updateCalendarEventSchema,
} from "@/features/calendar/schemas";
import { todoProposalSchema, todoUpdatePatchSchema } from "@/features/tasks/schemas";
import { shoppingItemCreateSchema } from "@/features/shopping/schemas";

export const agentActionDomainSchema = z.enum([
  "calendar",
  "tasks",
  "notes",
  "career",
  "memory",
  "projects",
  "shopping",
  "travel",
]);
export const agentRiskSchema = z.enum(["low", "medium", "high"]);

export const noteCreateProposalSchema = z.object({
  title: z.string().trim().min(1).max(240),
  bodyMarkdown: z.string().max(200_000),
  folderId: z.string().uuid().nullable().default(null),
  summaryOfChanges: z.string().trim().min(1).max(500),
});

export const noteUpdateProposalSchema = z.object({
  noteId: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  currentTitle: z.string().max(240),
  currentBodyHash: z.string().min(1).max(128),
  newTitle: z.string().trim().min(1).max(240).optional(),
  suggestedBody: z.string().max(200_000),
  summaryOfChanges: z.string().trim().min(1).max(1000),
});

/** 笔记移动提案：把一篇笔记移入已有文件夹或新建文件夹。目标二选一，确认前绝不移动。 */
export const noteMoveProposalSchema = z
  .object({
    noteId: z.string().uuid(),
    noteTitle: z.string().trim().min(1).max(240),
    destinationFolderId: z.string().uuid().nullable().default(null),
    newFolderName: z.string().trim().min(1).max(120).nullable().default(null),
    reason: z.string().trim().min(1).max(500),
  })
  .refine(
    (data) => Boolean(data.destinationFolderId) !== Boolean(data.newFolderName),
    { message: "目标必须且只能给一个（destinationFolderId 或 newFolderName）" },
  );

export const todoCompleteProposalSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  expectedStatus: z.string().trim().min(1).max(80),
  expectedLastModifiedAt: z.string().datetime({ offset: true }).nullable(),
});

const todoSnapshotSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  expectedStatus: z.string().trim().min(1).max(80),
  expectedLastModifiedAt: z.string().datetime({ offset: true }).nullable(),
});

export const todoUpdateProposalSchema = todoSnapshotSchema.extend({
  currentBodyText: z.string().max(10_000).nullable(),
  currentImportance: z.enum(["low", "normal", "high"]),
  currentDueAt: z.string().datetime({ offset: true }).nullable(),
  patch: todoUpdatePatchSchema,
  reason: z.string().trim().min(1).max(500),
});
export const todoDeleteProposalSchema = todoSnapshotSchema.extend({ reason: z.string().trim().min(1).max(500) });
export const todoReopenProposalSchema = todoSnapshotSchema.extend({ reason: z.string().trim().min(1).max(500) });

const optionalIso = z.string().datetime({ offset: true }).nullable().default(null);
const optionalDate = z.string().date().nullable().default(null);

export const careerMilestoneProposalSchema = z
  .object({
    trackId: z.string().uuid(),
    careerDirectionId: z.string().uuid().nullable().default(null),
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(4_000).nullable().default(null),
    targetDate: z.string().date(),
    status: z.enum(["planned", "in_progress"]).default("planned"),
    importance: z.enum(["low", "normal", "high"]).default("normal"),
    reason: z.string().trim().min(1).max(500),
  });

export const careerFactProposalSchema = z.object({
  experienceId: z.string().uuid(),
  factType: z.enum([
    "responsibility",
    "action",
    "tool",
    "scale",
    "metric",
    "collaboration",
    "process",
    "result",
    "context",
    "other",
  ]),
  content: z.string().trim().min(1).max(10_000),
  metricValue: z.number().finite().nullable().default(null),
  metricUnit: z.string().trim().max(80).nullable().default(null),
  occurredAt: optionalDate,
  sourceDocumentId: z.string().uuid().nullable().default(null),
  notesMarkdown: z.string().max(12_000).nullable().default(null),
  reason: z.string().trim().min(1).max(500),
});

const memoryBase = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(10_000),
  reason: z.string().trim().min(1).max(500),
  aiVisibility: z.enum(["normal", "sensitive", "never"]).default("normal"),
});

export const memoryCreateProposalSchema = z.discriminatedUnion("type", [
  memoryBase.extend({
    type: z.literal("profile"),
    validUntil: z.null().default(null),
    reviewAt: optionalIso,
  }),
  memoryBase.extend({
    type: z.literal("working"),
    validUntil: optionalIso,
    reviewAt: optionalIso,
  }).refine((value) => Boolean(value.validUntil || value.reviewAt), {
    message: "Working Memory 必须设置有效期或复核时间",
  }),
  memoryBase.extend({
    type: z.literal("decision"),
    rationaleMarkdown: z.string().max(20_000).default(""),
    importance: z.enum(["low", "normal", "high"]).default("normal"),
    decidedAt: z.string().datetime({ offset: true }).optional(),
    reviewAt: optionalIso,
  }),
]);

export const shoppingCreateProposalSchema = shoppingItemCreateSchema.extend({
  reason: z.string().trim().min(1).max(500),
});
export const travelCreateProposalSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(10_000).nullable().default(null),
  destinationLabel: z.string().trim().max(240).nullable().default(null),
  reason: z.string().trim().min(1).max(500),
});

export const memoryUpdateProposalSchema = z
  .object({
    memoryId: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    memoryType: z.enum(["profile", "working"]),
    title: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(10_000),
    reason: z.string().trim().min(1).max(500),
    aiVisibility: z.enum(["normal", "sensitive", "never"]).default("normal"),
    validUntil: optionalIso,
    reviewAt: optionalIso,
  })
  .refine(
    (value) =>
      value.memoryType !== "working" || Boolean(value.validUntil || value.reviewAt),
    { message: "Working Memory 必须设置有效期或复核时间" },
  );

export const projectCreateProposalSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    description: z.string().trim().max(10_000).nullable().default(null),
    areaId: z.string().uuid().nullable().default(null),
    startDate: optionalDate,
    dueDate: optionalDate,
    reason: z.string().trim().min(1).max(500),
  })
  .refine(
    (value) => !value.startDate || !value.dueDate || value.startDate <= value.dueDate,
    { path: ["dueDate"], message: "项目截止日期不能早于开始日期" },
  );

export const agentActionPayloadSchemas = {
  "calendar.create": createCalendarEventSchema,
  "calendar.update": updateCalendarEventSchema,
  "calendar.delete": deleteCalendarEventSchema,
  "tasks.create": todoProposalSchema,
  "tasks.update": todoUpdateProposalSchema,
  "tasks.delete": todoDeleteProposalSchema,
  "tasks.complete": todoCompleteProposalSchema,
  "tasks.reopen": todoReopenProposalSchema,
  "notes.create": noteCreateProposalSchema,
  "notes.update": noteUpdateProposalSchema,
  "notes.move": noteMoveProposalSchema,
  "career.milestone.create": careerMilestoneProposalSchema,
  "career.fact.create": careerFactProposalSchema,
  "memory.create": memoryCreateProposalSchema,
  "memory.update": memoryUpdateProposalSchema,
  "projects.create": projectCreateProposalSchema,
  "shopping.create": shoppingCreateProposalSchema,
  "travel.create": travelCreateProposalSchema,
} as const;

export type AgentActionType = keyof typeof agentActionPayloadSchemas;

export function parseAgentActionPayload(actionType: string, payload: unknown) {
  const schema = agentActionPayloadSchemas[actionType as AgentActionType];
  if (!schema) return { success: false as const, error: "unsupported_action" };
  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { success: true as const, data: parsed.data }
    : { success: false as const, error: "invalid_payload" };
}
