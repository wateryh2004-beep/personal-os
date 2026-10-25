"use client";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Eye, GripVertical, MoreHorizontal } from "lucide-react";
import { workbenchComparable, workbenchDragMime, workbenchRefKey, type WorkbenchRef } from "@/features/workbench/contracts";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useWorkbench } from "./workbench-context";
export { useWorkbench } from "./workbench-context";
export type WorkbenchRecordProps = { entity: WorkbenchRef; title: string; group: string; children: ReactNode; className?: string; selectable?: boolean; draggable?: boolean };
/** Keep the normal record link intact. Only the dedicated handle starts a ref-only drag. */
export function WorkbenchRecord({ entity, title, group, children, className = "", selectable = true, draggable = true }: WorkbenchRecordProps) {
  const workbench = useWorkbench();
  const element = useRef<HTMLDivElement>(null);
  const { kind, id, investmentType } = entity;
  const stableEntity = useMemo(() => ({ kind, id, ...(investmentType ? { investmentType } : {}) }), [kind, id, investmentType]);
  const register = workbench?.register;
  useEffect(() => element.current && register ? register({ ref: stableEntity, title, group, element: element.current }) : undefined, [stableEntity, title, group, register]);
  if (!workbench) return <>{children}</>;
  const key = workbenchRefKey(stableEntity);
  const selected = workbench.isSelected(entity);
  const canDrag = draggable && ["note", "document", "task"].includes(entity.kind);
  return <div ref={element} className={`workbench-record ${className}`} data-workbench-record={key} data-selected={selected || undefined} tabIndex={0}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget || event.nativeEvent.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === " ") { event.preventDefault(); workbench.openPreview(entity, group, event.currentTarget); }
    }}>
    <div className="workbench-record-body">{children}</div>
    <div className="workbench-record-actions" aria-label={`${title}的工作台操作`}>
      {selectable ? <label className="workbench-select-control"><input type="checkbox" aria-label={`选择 ${title}`} checked={selected} onChange={() => workbench.toggleSelection(entity, group)} /></label> : null}
      <button type="button" aria-label={`预览 ${title}`} title="预览（选择记录后按空格）" onClick={(event) => workbench.openPreview(entity, group, event.currentTarget)}><Eye size={15} aria-hidden="true" /><span>预览</span></button>
      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`${title}的更多操作`}><MoreHorizontal size={15} aria-hidden="true"/><span>操作</span></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="workbench-record-menu"><DropdownMenuItem onSelect={() => workbench.openReference(entity)}>放到参考区</DropdownMenuItem>
          {workbenchComparable(entity) ? <DropdownMenuItem onSelect={() => { if (!selected) workbench.toggleSelection(entity, group); else workbench.compare(); }}>{selected ? "比较已选记录" : "加入比较选择"}</DropdownMenuItem> : null}
          {["task", "note", "document"].includes(entity.kind) ? <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("personal-os:workbench-operation", { detail: { kind: entity.kind === "task" ? "schedule" : "link", ref: entity } }))}>{entity.kind === "task" ? "安排到日历…" : "建立关联…"}</DropdownMenuItem> : null}
        </DropdownMenuContent></DropdownMenu>
      {canDrag ? <button type="button" className="workbench-drag-handle" draggable aria-label={`拖动 ${title} 建立关联或安排`} title="拖动记录引用" onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(workbenchDragMime, JSON.stringify(entity)); }}><GripVertical size={15} aria-hidden="true" /></button> : null}
    </div>
  </div>;
}
