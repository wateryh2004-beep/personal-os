/**
 * 跨实体引用(P1):笔记 / 任务 / 日程 / 文件 四类实体可互相 @ 引用。
 * 正文存 markdown 链接 [标题](/type/id 形式),保存时解析写入 entity_links
 * (relationship_type = reference)。可链接类型在此注册,后续扩展只需加一行。
 */

export const linkableEntityTypes = ["note", "todo_task", "calendar_event", "document"] as const;
export type LinkableEntityType = (typeof linkableEntityTypes)[number];

/** 每个可链接实体类型的本地表、标题列与中文名。 */
export const linkableEntityTable: Record<
  LinkableEntityType,
  { table: string; titleColumn: string; label: string }
> = {
  note: { table: "notes", titleColumn: "title", label: "笔记" },
  todo_task: { table: "microsoft_todo_tasks", titleColumn: "title", label: "任务" },
  calendar_event: { table: "calendar_events", titleColumn: "subject", label: "日程" },
  document: { table: "documents", titleColumn: "title", label: "文件" },
};

export function isLinkableEntityType(value: string): value is LinkableEntityType {
  return (linkableEntityTypes as readonly string[]).includes(value);
}

/** 选择器 / 补全返回的可选实体。 */
export type EntityLinkSuggestion = {
  id: string;
  title: string;
  href: string;
  label: string;
};

/** 单个内链出现(含位置,供未来装饰复用)。 */
export type InternalEntityLink = {
  type: LinkableEntityType;
  id: string;
  label: string;
  from: number;
  to: number;
};

/** 跨实体内链的规范 href。搜索 entityHref 生成的结果必须与此完全一致,解析器才能还原。 */
export function entityHrefFor(type: LinkableEntityType, id: string): string {
  switch (type) {
    case "note":
      return `/notes/${id}`;
    case "todo_task":
      return `/tasks?task=${id}`;
    case "calendar_event":
      return `/calendar?event=${id}`;
    case "document":
      return `/files?file=${id}`;
  }
}
