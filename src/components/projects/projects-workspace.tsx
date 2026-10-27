"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { Plus, SquareKanban } from "lucide-react";
import { useDialogReturnFocus } from "@/components/shared/use-dialog-return-focus";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import { OperationLinkTarget } from "@/components/workbench/operation-links";
import type { createProject } from "@/features/projects/actions";
import { ProjectProgress,type ProjectWorkflowTransport, type ProjectPresentation } from "./project-progress";
import styles from "./projects-workspace.module.css";
import {IntentDraftForm} from "@/components/workflow-continuity/intent-draft-form";
import {submitProjectCreationIntent,readProjectCreationIntent} from "@/features/projects/creation-intents";
import { useDraftResumeOpeners } from "@/features/workflow-continuity/draft-resume";
import { useDomainViewAdapter, waitForViewLayout } from "@/features/workbench/domain-adapters/use-domain-view-adapter";

import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import type { ProjectMaterialAttachment } from "@/features/projects/queries";

type Project = ProjectPresentation;
type StatusFilter = "all" | "active" | "completed" | "paused" | "other";
const statusGroup = (status: string): Exclude<StatusFilter, "all"> =>
  status === "active" || status === "completed"
    ? status
    : status === "paused" || status === "on_hold"
      ? "paused"
      : "other";

export type ProjectCreationTransport={submit:typeof submitProjectCreationIntent;read:typeof readProjectCreationIntent};
export function ProjectsWorkspace({
  workflowTransport,createTransport,creationTransport,
  projects,
  initialCreateOpen = false,
  todoTasks = [],
  tasksUnavailable = false,
  tasksTruncated = false,
  materials = [],
  materialsUnavailable = false,
  materialsTruncated = false,
  attachments = [], attachmentsUnavailable = false, attachmentsTruncated = false,
}: {
  workflowTransport?:ProjectWorkflowTransport;createTransport?:typeof createProject;creationTransport?:ProjectCreationTransport;
  projects: Project[];
  initialCreateOpen?: boolean;
  todoTasks?: {
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
}) {
  assertContinuousFixtureTransport(workflowTransport);assertContinuousFixtureTransport(createTransport);assertContinuousFixtureTransport(creationTransport);
  const { rememberTrigger, restoreFocus } = useDialogReturnFocus();
  const [open, setOpen] = useState(false);
  const [creating,setCreating]=useState(false),createBusy=useRef(false);
  const [success, setSuccess] = useState("");
  const initialCreateIntent = useRef(initialCreateOpen);
  const searchParams = useSearchParams();
  const [expandedProjectIds,setExpandedProjectIds]=useState<string[]>([]);
  const rawStatus = searchParams.get("status");
  const statusFilter: StatusFilter =
    rawStatus === "active" ||
    rawStatus === "completed" ||
    rawStatus === "paused" ||
    rawStatus === "other"
      ? rawStatus
      : "all";
  const setStatusFilter = (value: StatusFilter) => {
    const url = new URL(window.location.href);
    if (value === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", value);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  };
  const visibleProjects =
    statusFilter === "all"
      ? projects
      : projects.filter(
          (project) => statusGroup(project.status) === statusFilter,
        );
  const counts = projects.reduce(
    (value, project) => {
      value[statusGroup(project.status)] += 1;
      return value;
    },
    { active: 0, completed: 0, paused: 0, other: 0 },
  );

  useEffect(() => {
    const initialIntent = initialCreateIntent.current;
    initialCreateIntent.current = false;
    const url = new URL(window.location.href);
    if (url.searchParams.get("create") !== "1" && !initialIntent) return;
    // Consume the intent before Dialog installs its mobile Back entry. Keep
    // unrelated filters and the current anchor intact. Next preserves its own
    // history internals; passing __NA here would skip its URL subscription.
    if (url.searchParams.get("create") === "1") {
      url.searchParams.delete("create");
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
    setSuccess("");
    setOpen(true);
  }, [searchParams]);

  useDraftResumeOpeners([{kind:"project.create",id:"new"},...projects.map(project=>({kind:"project.progress" as const,id:project.id}))],target=>{if(target.kind==="project.create"){setOpen(true);return;}if(!projects.some(project=>project.id===target.id))return false;setStatusFilter("all");setExpandedProjectIds(ids=>ids.includes(target.id)?ids:[...ids,target.id]);});
  useDomainViewAdapter({kind:"projects",pathname:"/projects",ready:true,capture:()=>({kind:"projects",expandedProjectIds}),restore:async(state,context)=>{if(!context.current())return {status:"cancelled"};const ids=state.expandedProjectIds.filter(id=>projects.some(project=>project.id===id));setStatusFilter("all");setExpandedProjectIds(ids);if(!await waitForViewLayout(context))return {status:"cancelled"};return ids.length===state.expandedProjectIds.length?{status:"applied"}:{status:"partial",reason:"missing-record"};}});
  const changeOpen = (nextOpen: boolean) => {
    if(createBusy.current)return false;
    if (nextOpen) setSuccess("");
    setOpen(nextOpen);
  };

  return (
    <div className={styles.workspace}>
      <PageHeader
        title="项目"
        action={
          <Button
            onClick={(event) => {
              rememberTrigger(event.currentTarget);
              changeOpen(true);
            }}
          >
            <Plus aria-hidden="true" />
            新建项目
          </Button>
        }
      />

      {success ? (
        <p role="status" className="mt-3 text-[12px] text-[var(--success)]">
          {success}
        </p>
      ) : null}

      {projects.length ? (
        <>
          <div className={styles.overview}>
            <strong>{counts.active}</strong>
            <p>
              个项目正在推进
              {counts.completed ? `，${counts.completed} 个已完成` : ""}
            </p>
          </div>
          <div
            className={styles.filters}
            role="group"
            aria-label="按项目状态筛选"
          >
            {(
              [
                ["all", "全部", projects.length],
                ["active", "进行中", counts.active],
                ["paused", "已暂停", counts.paused],
                ["completed", "已完成", counts.completed],
                ...(counts.other
                  ? [["other", "其他状态", counts.other] as const]
                  : []),
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          <div className={styles.grid}>
            {visibleProjects.map((project) => (
              <div key={project.id}>
                <WorkbenchRecord
                  entity={{ kind: "project", id: project.id }}
                  title={project.name}
                  group="projects"
                >
                  <OperationLinkTarget
                    target={{ type: "project", id: project.id }}
                    title={project.name}
                  >
                    <ProjectProgress transport={workflowTransport}
                      expanded={expandedProjectIds.includes(project.id)}
                      onExpandedChange={expanded=>setExpandedProjectIds(ids=>expanded?[...new Set([...ids,project.id])]:ids.filter(id=>id!==project.id))}
                      project={project}
                      materials={materials.filter(
                        (note) => note.project_id === project.id,
                      )}
                      attachments={attachments.filter(file=>file.projectId===project.id)}
                      attachmentsUnavailable={attachmentsUnavailable}
                      attachmentsTruncated={attachmentsTruncated}
                      materialsUnavailable={materialsUnavailable}
                      materialsTruncated={materialsTruncated}
                      tasks={todoTasks}
                      tasksUnavailable={tasksUnavailable}
                      tasksTruncated={tasksTruncated}
                    />
                  </OperationLinkTarget>
                </WorkbenchRecord>
              </div>
            ))}
          </div>
          {!visibleProjects.length ? (
            <p className={styles.emptyFilter} aria-live="polite">
              此状态下没有项目
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <SquareKanban
            className="size-6 text-[var(--text-tertiary)]"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-[13.5px] font-medium text-[var(--text-primary)]">
            还没有进行中的项目
          </h2>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            只在确实需要持续推进与聚合时创建项目。
          </p>
          <Button
            size="sm"
            className="mt-3.5"
            onClick={(event) => {
              rememberTrigger(event.currentTarget);
              changeOpen(true);
            }}
          >
            新建项目
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent onCloseAutoFocus={restoreFocus} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>
              建立项目容器；具体行动继续进入任务。
            </DialogDescription>
          </DialogHeader>
          <IntentDraftForm onPendingChange={value=>{createBusy.current=value;setCreating(value);}} draft={{operation:"project.create",id:"new",href:"/projects",label:"新建项目"}} submit={creationTransport?.submit??submitProjectCreationIntent} read={creationTransport?.read??readProjectCreationIntent} onSaved={(_id,unchanged)=>{if(unchanged)setOpen(false);setSuccess(unchanged?"项目已创建":"原项目已创建，当前新输入尚未保存。");}} className="grid gap-3">
            <fieldset
              className="grid min-w-0 gap-3 disabled:opacity-70"
            >
              <legend className="sr-only">新建项目内容</legend>
              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
                项目名称
                <Input
                  name="name"
                  required
                  maxLength={180}
                  autoComplete="off"
                  placeholder="例如：Personal OS 2.0"
                />
              </label>
              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
                说明（可选）
                <Textarea
                  name="description"
                  maxLength={8000}
                  rows={4}
                  autoComplete="off"
                  placeholder="目标、边界和完成标准…"
                />
              </label>
              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
                截止日期（可选）
                <Input name="due_date" type="date" />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={creating}
                  onClick={() => changeOpen(false)}
                >
                  稍后继续
                </Button>
                <Button type="submit" disabled={creating}>
                  创建或核对项目
                </Button>
              </div>
            </fieldset>
          </IntentDraftForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}
