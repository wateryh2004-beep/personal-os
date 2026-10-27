"use client";
import {useDomainViewAdapter,waitForViewLayout} from "@/features/workbench/domain-adapters/use-domain-view-adapter";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import { draftResumeKey, focusDraftForm, useDraftResumeConsumer } from "@/features/workflow-continuity/draft-resume";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";

import { SourceLink as Link } from "@/components/workflow-continuity/provider";
import { useState, useSyncExternalStore } from "react";
import { useDraftResumeOpeners } from "@/features/workflow-continuity/draft-resume";
import { z } from "zod";
import {
  saveCareerMaterialCheck,
  readCareerMaterialCheck,
} from "@/features/career/material-checks";
import {
  materialObjectSnapshot,
  materialObjectRevisionsMatch,
  materialTimestampsMatch,
  materialTimestampKey,
  type MaterialDocument,
  type MaterialResume,
} from "@/features/career/material-verification";
import { getWorkflowDrafts, getWorkflowDraftsServerSnapshot, subscribeWorkflowDrafts, useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { Button } from "@/components/ui/button";
import {
  RevisionRecovery,
  useRevisionRecovery,
} from "@/components/shared/revision-recovery";
import type { Database } from "@/types/database";
export type CareerMaterialTransport={read:typeof readCareerMaterialCheck;save:typeof saveCareerMaterialCheck};
type Check = Database["public"]["Tables"]["career_material_checks"]["Row"];
const draftSchema = z.object({
  label: z.string(),
  required: z.boolean(),
  documentId: z.string(),
  resumeId: z.string(),
  note: z.string(),
  revision: z.number(),
  verificationIntent: z
    .enum(["keep", "clear", "verify"])
    .optional()
    .default("keep"),
  verificationObjectRevision: z.string().nullable().optional().default(null),
  verificationDocumentRevision: z.number().nullable().optional().default(null),
  verificationResumeUpdatedAt: z.string().nullable().optional().default(null),
});
function draftFromRow(row?: Check | null) {
  return {
    label: row?.label ?? "",
    required: row?.required ?? true,
    documentId: row?.document_id ?? "",
    resumeId: row?.resume_version_id ?? "",
    note: row?.note ?? "",
    revision: row?.revision ?? 0,
    verificationIntent: "keep" as "keep" | "clear" | "verify",
    verificationObjectRevision: null as string | null,
    verificationDocumentRevision: null as number | null,
    verificationResumeUpdatedAt: null as string | null,
  };
}
export function CareerMaterialChecklist({
  transport,
  opportunityId,
  checks,
  documents,
  resumes,
}: {
  transport?:CareerMaterialTransport;
  opportunityId: string;
  checks: Check[];
  documents: MaterialDocument[];
  resumes: MaterialResume[];
}) {
  assertContinuousFixtureTransport(transport);
  const [rows, setRows] = useState(checks),
    [adding, setAdding] = useState<string | null>(null);
  const [expandedIds,setExpandedIds]=useState<string[]>([]),[selectedId,setSelectedId]=useState<string|null>(null);
  useDomainViewAdapter({kind:"career",pathname:`/career/opportunities/${opportunityId}/materials`,ready:true,capture:()=>({kind:"career",pathname:`/career/opportunities/${opportunityId}/materials`,expandedIds,selectedId,scroll:{}}),restore:async(state,context)=>{if(!context.current())return {status:"cancelled"};const ids=state.expandedIds.filter(id=>rows.some(row=>row.id===id));setExpandedIds(ids);const selected=state.selectedId&&rows.some(row=>row.id===state.selectedId)?state.selectedId:null;setSelectedId(selected);if(!await waitForViewLayout(context))return {status:"cancelled"};return ids.length===state.expandedIds.length&&(!state.selectedId||selected)?{status:"applied"}:{status:"partial",reason:"missing-record"};}});
  const drafts=useSyncExternalStore(subscribeWorkflowDrafts,getWorkflowDrafts,getWorkflowDraftsServerSnapshot);
  const targets=drafts.flatMap(draft=>draft.resumeTarget?.kind==="career.material"&&draft.resumeTarget.parentId===opportunityId?[draft.resumeTarget]:[]);
  useDraftResumeOpeners(targets,target=>{if(target.parentId!==opportunityId)return false;if(!rows.some(row=>row.id===target.id))setAdding(target.id);});
  return (
    <section className="mt-6 space-y-4">
      <h2 className="text-lg font-medium">我需要准备的材料</h2>
      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        文件存在、简历定稿与人工核验分别显示；材料齐全不会改变申请状态，也不会投递或联系任何人。
      </p>
      {[
        ...rows.map((row) => ({ id: row.id, row })),
        ...(adding ? [{ id: adding, row: undefined }] : []),
      ].map(({ id, row }) => (
        <MaterialRow expanded={row?expandedIds.includes(id):undefined} onExpandedChange={open=>{setExpandedIds(ids=>open?[...new Set([...ids,id])]:ids.filter(value=>value!==id));setSelectedId(value=>open?id:value===id?null:value);}} transport={transport}
          key={id}
          row={row}
          newId={row ? undefined : id}
          opportunityId={opportunityId}
          documents={documents}
          resumes={resumes}
          onSaved={(saved) => {
            setRows((before) =>
              before.some((item) => item.id === saved.id)
                ? before.map((item) => (item.id === saved.id ? saved : item))
                : [...before, saved],
            );
            if (adding === saved.id) setAdding(null);
          }}
        />
      ))}
      {!adding ? (
        <Button
          variant="outline"
          onClick={() => setAdding(crypto.randomUUID())}
        >
          添加需要的材料 / 人工核验项
        </Button>
      ) : null}
    </section>
  );
}
function MaterialRow({
  expanded:controlledExpanded,onExpandedChange,
  transport,
  row: initialRow,
  newId,
  opportunityId,
  documents,
  resumes,
  onSaved,
}: {
  expanded?:boolean;onExpandedChange?:(open:boolean)=>void;
  transport?:CareerMaterialTransport;
  row?: Check;
  newId?: string;
  opportunityId: string;
  documents: MaterialDocument[];
  resumes: MaterialResume[];
  onSaved: (row: Check) => void;
}) {
  const id = initialRow?.id ?? newId!;
  const [localExpanded,setLocalExpanded]=useState(!initialRow);const expanded=controlledExpanded??localExpanded;const setExpanded=(open:boolean)=>{setLocalExpanded(open);onExpandedChange?.(open);};
  const [row, setRow] = useState(initialRow),
    [rowSource, setRowSource] = useState(initialRow);
  if (rowSource !== initialRow) {
    setRowSource(initialRow);
    if (initialRow && initialRow.revision >= (row?.revision ?? 0))
      setRow(initialRow);
  }
  const { value, setValue, commit, restored, recoveryUnavailable,isCurrent,uncertain,markUncertain,resolveUncertain } = useWorkflowDraft({
    kind: "career",
    id: `material:${id}`,
    label: "机会材料核对",
    resumeHref: `/career/opportunities/${opportunityId}/materials`,
    resumeTarget: {kind:"career.material",id,parentId:opportunityId},
    initialValue: draftFromRow(row),
    parse: (input) => {
      const result = draftSchema.safeParse(input);
      return result.success ? result.data : null;
    },
  });
  useDraftResumeConsumer({kind:"career.material",identity:{id,parentId:opportunityId},ready:()=>true,open:async(target,context)=>{setExpanded(true);return focusDraftForm(target,context);}});
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const recovery =
    useRevisionRecovery<Awaited<ReturnType<typeof readCareerMaterialCheck>>>();
  const documentMap = new Map(documents.map((doc) => [doc.id, doc]));
  for (const id of recovery.latest?.documentIds ?? [])
    if (!recovery.latest?.documents.some((doc) => doc.id === id))
      documentMap.delete(id);
  for (const doc of recovery.latest?.documents ?? [])
    if (
      (documentMap.get(doc.id)?.mutation_revision ?? -1) <=
      doc.mutation_revision
    )
      documentMap.set(doc.id, doc);
  const latestDocuments = [...documentMap.values()];
  const resumeMap = new Map(resumes.map((resume) => [resume.id, resume]));
  for (const id of recovery.latest?.resumeIds ?? [])
    if (!recovery.latest?.resumes.some((resume) => resume.id === id))
      resumeMap.delete(id);
  for (const resume of recovery.latest?.resumes ?? []) {
    const incoming = materialTimestampKey(resume.updated_at),
      previous = materialTimestampKey(
        resumeMap.get(resume.id)?.updated_at ?? "",
      );
    if (
      !resumeMap.has(resume.id) ||
      (incoming !== null && (previous === null || incoming >= previous))
    )
      resumeMap.set(resume.id, resume);
  }
  const latestResumes = [...resumeMap.values()];
  const snapshot = materialObjectSnapshot(
    value.documentId || null,
    value.resumeId || null,
    latestDocuments,
    latestResumes,
  );
  const savedSnapshot = materialObjectSnapshot(
    row?.document_id ?? null,
    row?.resume_version_id ?? null,
    latestDocuments,
    latestResumes,
  );
  const existingVerified = Boolean(
    row?.verified_at &&
      materialObjectRevisionsMatch(
        row.verified_object_revision,
        savedSnapshot.token,
      ) &&
      savedSnapshot.canVerify,
  );
  const sameTargets =
    (row?.document_id ?? "") === value.documentId &&
    (row?.resume_version_id ?? "") === value.resumeId;
  const checked =
    value.verificationIntent === "verify"
      ? snapshot.canVerify &&
        materialObjectRevisionsMatch(
          value.verificationObjectRevision,
          snapshot.token,
        ) &&
        value.verificationDocumentRevision === snapshot.documentRevision &&
        materialTimestampsMatch(
          value.verificationResumeUpdatedAt,
          snapshot.resumeUpdatedAt,
        )
      : value.verificationIntent === "keep" && sameTargets && existingVerified;
  const doc = latestDocuments.find((item) => item.id === row?.document_id),
    resume = latestResumes.find((item) => item.id === row?.resume_version_id);
  const resetVerification = {
    verificationIntent: "clear" as const,
    verificationObjectRevision: null,
    verificationDocumentRevision: null,
    verificationResumeUpdatedAt: null,
  };
  const describe = (target: ReturnType<typeof draftFromRow>) => (
    <>
      <p>
        核对项：{target.label || "未填写"} · {target.required ? "必须" : "可选"}
      </p>
      <p className="whitespace-pre-wrap">依据：{target.note || "未填写"}</p>
      <p>
        文件：
        {target.documentId
          ? (latestDocuments.find((doc) => doc.id === target.documentId)
              ?.title ?? "暂不可用")
          : "未关联"}{" "}
        · 简历：
        {target.resumeId
          ? (latestResumes.find((resume) => resume.id === target.resumeId)
              ?.title ?? "暂不可用")
          : "未关联"}
      </p>
      <p>编辑基于版本 {target.revision}</p>
    </>
  );
  return (
    <details id={`career-material-${id}`}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="rounded-xl border border-[var(--separator)] p-4"
    >
      <summary className="min-h-11 cursor-pointer">
        {row?.label ?? "新材料"} ·{" "}
        {existingVerified
          ? "用户已核验"
          : row?.verified_at
            ? "对象已变化，待重新核对"
            : "待核对"}
      </summary>
      {row?.document_id ? (
        <p>
          {doc ? (
            <Link className="ui-link" href={`/files?file=${doc.id}`}>
              {doc.title}
            </Link>
          ) : (
            "文件暂不可用，引用保留"
          )}
        </p>
      ) : null}
      {row?.resume_version_id ? (
        <p>
          {resume ? (
            <Link
              className="ui-link"
              href={`/career/resumes?resume=${resume.id}`}
            >
              {resume.title} · {resume.status === "approved" ? "定稿" : "草稿"}
            </Link>
          ) : (
            "简历暂不可用"
          )}
        </p>
      ) : null}
      {row?.verified_at ? (
        <p className="text-xs">
          原核验记录：{row.verified_at}。只改备注不会把这一天改成今天。
        </p>
      ) : null}
      <form
        data-workflow-draft-key={draftResumeKey({kind:"career.material",id,parentId:opportunityId})}
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!isCurrent() || pending || recovery.reading||uncertain) return;
          setPending(true);
          const submitted = value,
            current = isCurrent;
          try {
            const saved = await (transport?.save??saveCareerMaterialCheck)({
              ...submitted,
              id,
              opportunityId,
              documentId: submitted.documentId || null,
              resumeId: submitted.resumeId || null,
            });
            if (current()) {
              commit(submitted, (before) => ({
                ...before,
                revision: saved.revision,
                ...(before.verificationIntent ===
                  submitted.verificationIntent &&
                before.verificationObjectRevision ===
                  submitted.verificationObjectRevision
                  ? {
                      verificationIntent: "keep" as const,
                      verificationObjectRevision: null,
                      verificationDocumentRevision: null,
                      verificationResumeUpdatedAt: null,
                    }
                  : {}),
              }));
              onSaved(saved);
              recovery.dismiss();
              setMessage("核对单已保存；核验记录按本次明确选择处理。");
            }
          } catch (error) {
            if (current()){markUncertain();
              setMessage(
                error instanceof Error ? error.message : "保存失败，输入保留",
              );}
          } finally {
            if (current()) setPending(false);
          }
        }}
      >
        <label>
          材料 / 核验项
          <input
            className="ui-field min-h-11 w-full text-base"
            required
            maxLength={240}
            value={value.label}
            onChange={(event) =>
              setValue((before) => ({ ...before, label: event.target.value }))
            }
          />
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={value.required}
            onChange={(event) =>
              setValue((before) => ({
                ...before,
                required: event.target.checked,
              }))
            }
          />
          本次必须准备
        </label>
        <label>
          私有原件（最近200份）
          <select
            className="ui-field min-h-11 w-full text-base"
            value={value.documentId}
            onChange={(event) =>
              setValue((before) => ({
                ...before,
                documentId: event.target.value,
                ...resetVerification,
              }))
            }
          >
            <option value="">未选择</option>
            {value.documentId &&
            !latestDocuments.some((doc) => doc.id === value.documentId) ? (
              <option value={value.documentId}>保留当前不可用引用</option>
            ) : null}
            {latestDocuments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          简历版本
          <select
            className="ui-field min-h-11 w-full text-base"
            value={value.resumeId}
            onChange={(event) =>
              setValue((before) => ({
                ...before,
                resumeId: event.target.value,
                ...resetVerification,
              }))
            }
          >
            <option value="">不关联简历</option>
            {value.resumeId &&
            !latestResumes.some((resume) => resume.id === value.resumeId) ? (
              <option value={value.resumeId}>保留当前不可用简历引用</option>
            ) : null}
            {latestResumes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {item.status === "approved" ? "定稿" : "草稿"}
              </option>
            ))}
          </select>
        </label>
        <label>
          核验依据
          <textarea
            className="ui-field w-full text-base"
            maxLength={4000}
            value={value.note}
            onChange={(event) =>
              setValue((before) => ({ ...before, note: event.target.value }))
            }
          />
        </label>
        <p className="text-xs">
          当前显示版本：
          {value.documentId
            ? `文件修订 ${snapshot.documentRevision ?? "不可用"}`
            : "未关联文件"}{" "}
          ·{" "}
          {value.resumeId
            ? `简历更新 ${snapshot.resumeUpdatedAt ?? "不可用"}`
            : "未关联简历"}
          。
        </p>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            disabled={!snapshot.canVerify}
            onChange={(event) => {
              if (event.target.checked)
                setValue((before) => ({
                  ...before,
                  verificationIntent: "verify",
                  verificationObjectRevision: snapshot.token,
                  verificationDocumentRevision: snapshot.documentRevision,
                  verificationResumeUpdatedAt: snapshot.resumeUpdatedAt,
                }));
              else setValue((before) => ({ ...before, ...resetVerification }));
            }}
          />
          我已重新核对当前显示的这份资料版本
        </label>
        <p className="text-xs">
          {value.verificationIntent === "verify"
            ? checked
              ? "本次保存将记录对上述确切版本的新核验。"
              : "资料版本已变化，原核验意图过期；请读取、核对后重新勾选。"
            : value.verificationIntent === "clear"
              ? "本次保存将清除核验标记。"
              : "保留已有核验记录；对象变化时仍显示待复核，不会自动重新核验。"}
        </p>
        {value.verificationIntent === "verify" ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setValue((before) => ({
                ...before,
                verificationIntent: "keep",
                verificationObjectRevision: null,
                verificationDocumentRevision: null,
                verificationResumeUpdatedAt: null,
              }))
            }
          >
            本次不新增核验，只保留已有记录
          </Button>
        ) : null}
        {!snapshot.canVerify ? (
          <p role="status">
            资料不可用或简历仍是草稿，不能核验；请先选择可用原件与定稿版本。
          </p>
        ) : null}
        {row?.verified_at && !checked ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setValue((before) => ({ ...before, ...resetVerification }))
            }
          >
            明确清除旧核验标记
          </Button>
        ) : null}
        <Button disabled={pending || recovery.reading||uncertain}>
          {pending ? "保存中…" : "保存核对项"}
        </Button>
        {message ? <p role="status">{message}</p> : null}
        {uncertain?<p role="status">原保存结果尚未确认，当前输入保留。请先读取最新记录并明确比较；不会重复发送原保存。</p>:null}<DraftRecoveryStatus restored={restored} recoveryUnavailable={recoveryUnavailable} />
      </form>
      <RevisionRecovery
        label="材料核对项"
        recovery={recovery}
        disabled={pending}
        onRead={() =>
          void recovery.read(() =>
            (transport?.read??readCareerMaterialCheck)({
              id,
              opportunityId,
              documentId: value.documentId || null,
              resumeId: value.resumeId || null,
              expectedExists: value.revision > 0,
            }),
          )
        }
        current={describe(value)}
        renderLatest={(latest) => (
          <>
            {describe(draftFromRow(latest.row))}
            <p>已保存核验时间：{latest.row?.verified_at ?? "未核验"}</p>
          </>
        )}
        onKeep={(latest) => {
                if(uncertain&&!latest.row){setMessage("原核对项仍不可定位，待核对状态与输入保留。");return;}resolveUncertain();
          if (latest.row) setRow(latest.row);
          setValue((before) => ({
            ...before,
            revision: latest.row?.revision ?? 0,
          }));
          setMessage(
            "当前编辑保留，基于刚读取的核对项版本；旧核验意图不会替新资料自动核验。",
          );
        }}
        onAdopt={(latest) => {
                if(uncertain&&!latest.row){setMessage("原核对项仍不可定位，待核对状态与输入保留。");return;}resolveUncertain();
          if (latest.row) setRow(latest.row);
          commit(value, () => draftFromRow(latest.row));
          setMessage("已采用刚读取的核对项内容；需要新核验时请明确重新勾选。");
        }}
      />
    </details>
  );
}
