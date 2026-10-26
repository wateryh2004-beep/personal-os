"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Flag } from "lucide-react";
import styles from "./projects-workspace.module.css";

export type ProjectPresentation = { id: string; name: string; description: string | null; status: string; due_date: string | null; updated_at: string };

export const projectStatusLabel: Record<string, string> = {
  active: "进行中", completed: "已完成", paused: "已暂停", on_hold: "已暂停", cancelled: "已取消",
};

/** A lifecycle, never a fabricated percentage, milestone, or next task. */
export function ProjectProgress({ project }: { project: ProjectPresentation }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const completed = project.status === "completed";
  const active = project.status === "active";
  const status = projectStatusLabel[project.status] ?? "其他状态";
  const due = project.due_date ? new Date(`${project.due_date.slice(0, 10)}T12:00:00Z`) : null;
  const validDue = due && Number.isFinite(due.getTime()) ? due : null;
  const updated = new Date(project.updated_at);
  return <article className={styles.project} data-project-status={project.status}>
    <div className={styles.projectHeading}>
      <div className={styles.projectIdentity}>
        <span className={styles.projectMark} aria-hidden="true">{completed ? <Check size={19} /> : <Flag size={19} />}</span>
        <h2><button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{project.name}<ChevronDown size={16} aria-hidden="true" className={styles.chevron} /></button></h2>
      </div>
      <span className={styles.status}>{status}</span>
    </div>
    <p className={styles.projectExcerpt}>{project.description || "尚未补充项目目标"}</p>
    <div className={styles.lifecycle} aria-label={`项目状态：${status}`}>
      <span data-current={active || undefined}><i aria-hidden="true" />推进</span>
      <span className={styles.lifecycleTrack} aria-hidden="true"><i data-complete={completed || undefined} /></span>
      <span data-current={completed || undefined}><i aria-hidden="true">{completed ? <Check size={10} /> : null}</i>完成</span>
    </div>
    <div className={styles.projectFoot}>
      <span>{validDue ? <>目标日 <time dateTime={project.due_date!}>{new Intl.DateTimeFormat("zh-CN", { timeZone: "UTC", month: "long", day: "numeric" }).format(validDue)}</time></> : "未设目标日"}</span>
      <button type="button" className="ui-link" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{expanded ? "收起目标" : "展开目标"}</button>
    </div>
    <div id={detailsId} className={styles.detailsGrid} data-expanded={expanded} inert={!expanded} aria-hidden={!expanded}>
      <div className={styles.detailsClip}><div className={styles.detailsContent}>
        <h3>项目目标</h3>
        <p>{project.description || "尚未补充项目说明，可先通过关联笔记或文件保留目标与依据。"}</p>
        <p className={styles.updated}>{Number.isFinite(updated.getTime()) ? <>最近更新 <time dateTime={project.updated_at}>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(updated)}</time></> : "更新时间暂不可用"}</p>
      </div></div>
    </div>
  </article>;
}
