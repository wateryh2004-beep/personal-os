import { z } from "zod";

export const inboxCaptureSchema = z.object({
  content: z.string().trim().min(1, "请输入想法。").max(10_000),
});

const isoDateTime = z.string().datetime({ offset: true });

export const inboxProposalSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("task"),
    todoListId: z.string().uuid(),
    title: z.string().trim().min(1).max(500),
    bodyText: z.string().trim().max(10_000).nullable(),
    importance: z.enum(["low", "normal", "high"]),
    dueAt: isoDateTime.nullable(),
  }),
  z.object({
    target: z.literal("calendar"),
    subject: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).nullable(),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    locationName: z.string().trim().max(500).nullable(),
    isAllDay: z.boolean(),
  }).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), { message: "结束时间必须晚于开始时间。" }),
  z.object({
    target: z.literal("note"),
    title: z.string().trim().min(1).max(240),
    bodyMarkdown: z.string().max(10_000),
  }),
  z.object({ target: z.literal("daily") }),
]);

export type InboxProposal = z.infer<typeof inboxProposalSchema>;
