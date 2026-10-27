"use client";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import { draftResumeKey, focusDraftForm, useDraftResumeConsumer } from "@/features/workflow-continuity/draft-resume";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";


import { SourceLink } from "@/components/workflow-continuity/provider";
import { useId,useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import {
  RevisionRecovery,
  useRevisionRecovery,
} from "@/components/shared/revision-recovery";
import {
  readProjectWorkflow,
  saveProjectWorkflow,
} from "@/features/projects/actions";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Flag } from "lucide-react";
import styles from "./projects-workspace.module.css";

import type { ProjectMaterialAttachment } from "@/features/projects/queries";

export type ProjectWorkflowTransport={read:typeof readProjectWorkflow;save:typeof saveProjectWorkflow};
export type ProjectPresentation = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  due_date: string | null;
  updated_at: string;
  blocker_text?: string;
  next_todo_task_id?: string | null;
  mutation_revision?: number;
};

export const projectStatusLabel: Record<string, string> = {
  active: "进行中",
  completed: "已完成",
  paused: "已暂停",
  on_hold: "已暂停",
  cancelled: "已取消",
};

/** A lifecycle, never a fabricated percentage, milestone, or next task. */
export function ProjectProgress({
  transport,
  project: initialProject,
  tasks = [],
  tasksUnavailable = false,
  tasksTruncated = false,
  materials = [],
  materialsUnavailable = false,
  materialsTruncated = false,
  attachments = [], attachmentsUnavailable = false, attachmentsTruncated = false,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  transport?:ProjectWorkflowTransport;
  project: ProjectPresentation;
  tasks?: {
    id: string;
    title: string;
    status: string;
    archived_at: string | null;
  }[];
  tasksUnavailable?: boolean;
  tasksTruncated?: boolean;
  materials?: { id: string; title: string; project_id: string | null }[];
  materialsUnavailable?: boolean;
  materialsTruncated?: boolean;
  attachments?: ProjectMaterialAttachment[]; attachmentsUnavailable?: boolean; attachmentsTruncated?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  assertContinuousFixtureTransport(transport);
  const readWorkflow=transport?.read??readProjectWorkflow,saveWorkflow=transport?.save??saveProjectWorkflow;
  const [project, setProject] = useState(initialProject);
  const [projectSource, setProjectSource] = useState(initialProject);
  if (projectSource !== initialProject) {
    setProjectSource(initialProject);
    if (
      initialProject.id !== project.id ||
      (initialProject.mutation_revision ?? 1) >=
        (project.mutation_revision ?? 1)
    )
      setProject(initialProject);
  }
  const recovery =
    useRevisionRecovery<Awaited<ReturnType<typeof readProjectWorkflow>>>();
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const schema = z.object({
    goal: z.string().max(8000),
    blocker: z.string().max(8000),
    nextTask: z.string(),
    revision: z.number(),
  });
  const { value, setValue, commit, restored, recoveryUnavailable,isCurrent,uncertain,markUncertain,resolveUncertain } = useWorkflowDraft({
    kind: "task",
    id: `project:${project.id}`,
    label: `项目 · ${project.name}`,
    resumeHref: "/projects",
    resumeTarget: { kind: "project.progress", id: project.id },
    initialValue: {
      goal: project.description ?? "",
      blocker: project.blocker_text ?? "",
      nextTask: project.next_todo_task_id ?? "",
      revision: project.mutation_revision ?? 1,
    },
    parse: (input) => {
      const result = schema.safeParse(input);
      return result.success ? result.data : null;
    },
  });
  const next = tasks.find((task) => task.id === project.next_todo_task_id);
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded=controlledExpanded??localExpanded;
  const expandedRef=useRef(expanded);useLayoutEffect(()=>{expandedRef.current=expanded;},[expanded]);
  const setExpanded=(next:boolean|((current:boolean)=>boolean))=>{const value=typeof next==="function"?next(expandedRef.current):next;expandedRef.current=value;setLocalExpanded(value);onExpandedChange?.(value);};
  useDraftResumeConsumer({kind:"project.progress",identity:{id:project.id},ready:()=>true,open:async(target,context)=>{setExpanded(true);return focusDraftForm(target,context);}});
  const detailsId = useId();
  const completed = project.status === "completed";
  const active = project.status === "active";
  const status = projectStatusLabel[project.status] ?? "其他状态";
  const due = project.due_date
    ? new Date(`${project.due_date.slice(0, 10)}T12:00:00Z`)
    : null;
  const validDue = due && Number.isFinite(due.getTime()) ? due : null;
  const updated = new Date(project.updated_at);
  return (
    <article id={`project-${project.id}`} className={styles.project} data-project-status={project.status}>
      <div className={styles.projectHeading}>
        <div className={styles.projectIdentity}>
          <span className={styles.projectMark} aria-hidden="true">
            {completed ? <Check size={19} /> : <Flag size={19} />}
          </span>
          <h2>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() => setExpanded((value) => !value)}
            >
              {project.name}
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={styles.chevron}
              />
            </button>
          </h2>
        </div>
        <span className={styles.status}>{status}</span>
      </div>
      <p className={styles.projectExcerpt}>
        {project.description || "尚未补充项目目标"}
      </p>
      <div className={styles.lifecycle} aria-label={`项目状态：${status}`}>
        <span data-current={active || undefined}>
          <i aria-hidden="true" />
          推进
        </span>
        <span className={styles.lifecycleTrack} aria-hidden="true">
          <i data-complete={completed || undefined} />
        </span>
        <span data-current={completed || undefined}>
          <i aria-hidden="true">{completed ? <Check size={10} /> : null}</i>完成
        </span>
      </div>
      <div className={styles.projectFoot}>
        <span>
          {validDue ? (
            <>
              目标日{" "}
              <time dateTime={project.due_date!}>
                {new Intl.DateTimeFormat("zh-CN", {
                  timeZone: "UTC",
                  month: "long",
                  day: "numeric",
                }).format(validDue)}
              </time>
            </>
          ) : (
            "未设目标日"
          )}
        </span>
        <button
          type="button"
          className="ui-link"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起目标" : "展开目标"}
        </button>
      </div>
      <div
        id={detailsId}
        className={styles.detailsGrid}
        data-expanded={expanded}
        inert={!expanded}
        aria-hidden={!expanded}
      >
        <div className={styles.detailsClip}>
          <div className={styles.detailsContent}>
            <h3>项目目标</h3>
            <p>
              {project.description ||
                "尚未补充项目说明，可先通过关联笔记或文件保留目标与依据。"}
            </p>
            <p>当前阻塞：{project.blocker_text || "未记录"}</p>
            <p>
              下一步：
              {project.next_todo_task_id
                ? next
                  ? `${next.title} · ${next.archived_at ? "已归档" : next.status === "completed" ? "已完成，请选下一步" : "Microsoft To Do"}`
                  : "任务暂不可用，关联保留"
                : "尚未选择"}
            </p>
            <form
              data-workflow-draft-key={draftResumeKey({kind:"project.progress",id:project.id})}
              className="mt-4 grid gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!isCurrent() || pending || recovery.reading||uncertain) return;
                setPending(true);
                const snapshot = value,
                  current = isCurrent;
                try {
                  const saved = await saveWorkflow({
                    id: project.id,
                    revision: snapshot.revision,
                    goal: snapshot.goal,
                    blocker: snapshot.blocker,
                    nextTask: snapshot.nextTask || null,
                  });
                  if (current()) {
                    setProject(saved);
                    commit(snapshot, (before) => ({
                      ...before,
                      revision: saved.mutation_revision,
                    }));
                    setMessage("目标、阻塞和下一步已保存");
                  }
                } catch (error) {
                  if (current()){markUncertain();
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "保存失败，输入保留",
                    );}
                } finally {
                  if (current()) setPending(false);
                }
              }}
            >
              <label className="grid gap-1 text-sm">
                项目目标
                <textarea
                  className="ui-field min-h-24 text-base"
                  maxLength={8000}
                  value={value.goal}
                  onChange={(event) =>
                    setValue((before) => ({
                      ...before,
                      goal: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                是什么卡住了
                <textarea
                  className="ui-field text-base"
                  maxLength={8000}
                  value={value.blocker}
                  onChange={(event) =>
                    setValue((before) => ({
                      ...before,
                      blocker: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                下一项 Microsoft To Do
                <select
                  className="ui-field min-h-11 text-base"
                  disabled={tasksUnavailable}
                  value={value.nextTask}
                  onChange={(event) =>
                    setValue((before) => ({
                      ...before,
                      nextTask: event.target.value,
                    }))
                  }
                >
                  <option value="">尚未选择 / 清除</option>
                  {project.next_todo_task_id &&
                  !tasks.some(
                    (task) => task.id === project.next_todo_task_id,
                  ) ? (
                    <option value={project.next_todo_task_id}>
                      当前关联不可用，保留
                    </option>
                  ) : null}
                  {tasks
                    .filter(
                      (task) =>
                        (!task.archived_at && task.status !== "completed") ||
                        task.id === project.next_todo_task_id,
                    )
                    .map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                        {task.status === "completed" ? " · 已完成" : ""}
                        {task.archived_at ? " · 已归档" : ""}
                      </option>
                    ))}
                </select>
              </label>
              {tasksUnavailable ? (
                <p role="status">任务读取失败，当前关联保留，请稍后再核对。</p>
              ) : tasksTruncated ? (
                <p>只展示最近500项任务。更多任务可从任务模块查找。</p>
              ) : null}
              <div>
                <Button disabled={pending || recovery.reading||uncertain}>
                  {pending ? "保存中…" : "保存项目下一步"}
                </Button>
                <a
                  className="ui-link ml-3 inline-flex min-h-11 items-center"
                  href="/tasks?create=1"
                >
                  新建 To Do
                </a>
              </div>
              {message ? <p role="status">{message}</p> : null}
              {uncertain?<p role="status">原保存结果尚未确认，当前输入保留。请先读取最新记录并明确比较；不会重复发送原保存。</p>:null}<DraftRecoveryStatus restored={restored} recoveryUnavailable={recoveryUnavailable} />
            </form>
            <RevisionRecovery
              label="项目"
              recovery={recovery}
              disabled={pending}
              onRead={() =>
                void recovery.read(() => readWorkflow(project.id))
              }
              current={
                <>
                  <p className="whitespace-pre-wrap">
                    目标：{value.goal || "未填写"}
                  </p>
                  <p className="whitespace-pre-wrap">
                    阻塞：{value.blocker || "未记录"}
                  </p>
                  <p>编辑基于版本 {value.revision}</p>
                </>
              }
              renderLatest={(latest) => (
                <>
                  <p className="whitespace-pre-wrap">
                    目标：{latest.description || "未填写"}
                  </p>
                  <p className="whitespace-pre-wrap">
                    阻塞：{latest.blocker_text || "未记录"}
                  </p>
                  <p>已保存版本 {latest.mutation_revision}</p>
                  {latest.next_todo_task_id ? (
                    <SourceLink
                      className="ui-link"
                      href={`/tasks?task=${latest.next_todo_task_id}`}
                    >
                      查看已保存的下一步任务
                    </SourceLink>
                  ) : (
                    <p>未选下一步任务</p>
                  )}
                </>
              )}
              onKeep={(latest) => {
                resolveUncertain();
                setProject(latest);
                setValue((before) => ({
                  ...before,
                  revision: latest.mutation_revision,
                }));
                setMessage("已保留当前输入，改为基于刚读取的版本；尚未保存。");
              }}
              onAdopt={(latest) => {
                resolveUncertain();
                setProject(latest);
                commit(value, () => ({
                  goal: latest.description ?? "",
                  blocker: latest.blocker_text,
                  nextTask: latest.next_todo_task_id ?? "",
                  revision: latest.mutation_revision,
                }));
                setMessage("已采用刚读取的项目内容。");
              }}
            />
            <section>
              <h3>项目资料</h3>
              {materialsUnavailable ? (
                <p role="status">资料暂时无法读取。</p>
              ) : (
                <ul>
                  {materials.map((note) => (
                    <li key={note.id}>
                      <SourceLink
                        className="ui-link inline-flex min-h-11 items-center"
                        sourceLabel={project.name}
                        href={`/notes/${note.id}`}
                      >
                        {note.title || "无标题笔记"}
                      </SourceLink>
                    </li>
                  ))}
                </ul>
              )}
              {attachmentsUnavailable ? <p role="status">资料附件暂时无法读取。</p> : attachments.length ? <section className="mt-3"><h4>该资料附件</h4><ul>{attachments.map(file=><li key={`${file.noteId}:${file.id}`} className="flex flex-wrap gap-x-3"><SourceLink className="ui-link inline-flex min-h-11 items-center" sourceLabel={project.name} href={`/files?file=${file.id}`}>{file.title || file.original_filename || "文件附件"}</SourceLink><SourceLink className="ui-link inline-flex min-h-11 items-center text-xs" sourceLabel={project.name} href={`/notes/${file.noteId}`}>所在笔记</SourceLink></li>)}</ul></section> : !materialsUnavailable && materials.length ? <p>这些资料暂未关联可用附件。</p> : null}
              {attachmentsTruncated ? <p role="status">附件读取达到本次上限，较早附件仍保留。</p> : null}
              {materialsTruncated ? (
                <p>本次仅列最近500篇有项目归属的笔记，较早资料仍保留。</p>
              ) : null}
            </section>
            <p className={styles.updated}>
              {Number.isFinite(updated.getTime()) ? (
                <>
                  最近更新{" "}
                  <time dateTime={project.updated_at}>
                    {new Intl.DateTimeFormat("zh-CN", {
                      dateStyle: "medium",
                    }).format(updated)}
                  </time>
                </>
              ) : (
                "更新时间暂不可用"
              )}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
