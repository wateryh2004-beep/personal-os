import { z } from "zod";
export const metadataOperations = ["note_rename", "note_move", "note_trash", "note_archive", "file_rename", "file_move", "file_archive"] as const;
export const metadataItemSchema = z.object({ id: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(500).optional(), folderId: z.string().uuid().nullable().optional() }).strict();
export const metadataCommandSchema = z.object({ requestId: z.string().uuid(), operation: z.enum(metadataOperations), items: z.array(metadataItemSchema).min(1).max(20) }).strict().superRefine((value, ctx) => {
  if (new Set(value.items.map(item => item.id)).size !== value.items.length) ctx.addIssue({ code: "custom", message: "不能重复选择同一条记录。" });
  if (value.operation.endsWith("rename") && value.items.some(item => !item.title || (item.title.length > 240))) ctx.addIssue({ code: "custom", message: "请输入有效标题。" });
  if (value.operation.endsWith("move") && value.items.some(item => item.folderId === undefined)) ctx.addIssue({ code: "custom", message: "请选择归属。" });
});
export type MetadataCommand = z.infer<typeof metadataCommandSchema>;
export type OperationResult = { status: "success" | "error" | "conflict" | "unknown"; message: string; receiptId?: string; rows?: Record<string, unknown>[]; requestId?: string };
export type OperationNotice = { receiptId: string; message: string };
export const operationNoticeEvent = "personal-os:operation-completed";
/** Transient notification contains only a server-issued receipt ID and a label. */
export function publishOperationReceipt(notice: OperationNotice) {
  if (typeof window !== "undefined" && z.string().uuid().safeParse(notice.receiptId).success) window.dispatchEvent(new CustomEvent(operationNoticeEvent, { detail: notice }));
}
export const operationLabels: Record<string, string> = { note_rename: "重命名笔记", note_move: "移动笔记", note_trash: "笔记移到回收站", note_archive: "归档笔记", file_rename: "重命名文件", file_move: "移动文件", file_archive: "归档文件", graph_link: "建立关联", tasks_update: "修改任务", tasks_complete: "完成任务", calendar_create: "创建日程", calendar_update: "修改日程", shopping_quantity: "修改采购数量", shopping_purchased: "标记已购", travel_stop_metadata: "修改旅行安排", travel_stop_arrival: "标记地点", travel_stop_order: "调整地点顺序", travel_next_stop: "选择下一站", travel_document: "关联票据", leisure_progress: "保存闲暇进度" };

export const operationStatusLabels: Record<string,string> = {
 prepared:"待确认",processing:"处理中",available:"可核对撤销",undone:"已撤销",
 unknown:"结果待核对",failed:"未完成",conflict:"有后续修改",
 remote_committed:"远端已写入待核对",expired:"已过期",
};
