"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
import { NoteDocumentShell } from "@/components/notes/note-document-shell";
import { NoteEditor } from "@/components/notes/note-editor";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import { continuityDocuments } from "./note-continuity-fixture";
import { noteDocumentCache } from "@/features/notes/document-resource";
import { workbenchEntityResource, workspaceScenesResource } from "@/features/workbench/resource";
import { captureWorkbenchPosition } from "@/components/workbench/workbench-position";
import type { WorkbenchPosition } from "@/features/workbench/contracts";
import type { WorkbenchEntity } from "@/features/workbench/contracts";
export const workbenchFixtureShopping: WorkbenchEntity[] = [1, 2, 3, 4].map((value) => ({ ref: { kind: "shopping", id: `20000000-0000-4000-8000-00000000000${value}` }, title: `合成采购候选 ${value}`, href: `/shopping/20000000-0000-4000-8000-00000000000${value}`, subtitle: null, fields: [{ key: "price", label: "价格（CNY）", value: value === 3 ? null : `${value * 20}.25` }, { key: "reason", label: "购买理由", value: value % 2 ? "替换旧物" : "便于携带" }], sourceUrls: ["https://example.com/synthetic-source"], currency: "CNY", asOf: "2026-10-25T00:00:00Z" }));
export const workbenchFixturePdf = { id: "70000000-0000-4000-8000-000000000001", title: "合成两页 PDF", original_filename: "synthetic-workbench.pdf", mime_type: "application/pdf", file_size: 2000, role: "primary_pdf" };
function seed() {
  workspaceScenesResource.set({ scenes: [] });
  for (const document of continuityDocuments) noteDocumentCache.get(document.note.id).set(document);
  workbenchEntityResource({ kind: "document", id: workbenchFixturePdf.id }).set({ status: "ready", entity: { ref: { kind: "document", id: workbenchFixturePdf.id }, title: workbenchFixturePdf.title, href: `/files?file=${workbenchFixturePdf.id}`, subtitle: null, fields: [], sourceUrls: [], asOf: null, pdf: { documentId: workbenchFixturePdf.id, title: workbenchFixturePdf.title } } });
  for (const entity of workbenchFixtureShopping) workbenchEntityResource(entity.ref).set({ status: "ready", entity });
}
function FixtureContent({ pdf = false }: { pdf?: boolean }) {
  const [capturedPosition, setCapturedPosition] = useState<WorkbenchPosition | null>(null);
  useEffect(seed, []);
  return <div data-testid="workbench-fixture" className="grid min-w-0 grid-cols-[minmax(0,1fr)] min-h-[70dvh] gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
    <div className="h-[72dvh] min-w-0 min-h-[480px] overflow-hidden">{pdf ? <NoteDocumentShell noteId={continuityDocuments[0].note.id} attachments={[workbenchFixturePdf]} editor={<NoteEditor note={continuityDocuments[0].note} noteAiDefaultModel="deepseek-v4-flash" />} inspector={null} /> : <NoteEditor note={continuityDocuments[0].note} noteAiDefaultModel="deepseek-v4-flash" />}</div>
    <section className="min-w-0" aria-label="合成参考记录">{pdf ? <><button type="button" className="ui-action-secondary mb-3 min-h-11 px-3" onClick={async (event) => setCapturedPosition(await captureWorkbenchPosition(event.currentTarget.closest<HTMLElement>(".workbench-main-pane"), "main"))}>捕获数值位置</button><output className="block break-all text-xs" data-testid="workbench-captured-position">{capturedPosition ? JSON.stringify(capturedPosition) : "尚未捕获"}</output></> : null}<h2 className="mb-4 text-lg">合成参考记录</h2>
      <WorkbenchRecord entity={{ kind: "note", id: continuityDocuments[1].note.id }} title="另一篇合成笔记" group="workbench-fixture-notes"><p className="p-3">另一篇合成笔记</p></WorkbenchRecord>
      <WorkbenchRecord entity={{ kind: "document", id: workbenchFixturePdf.id }} title={workbenchFixturePdf.title} group="workbench-fixture-files"><p className="p-3">{workbenchFixturePdf.title}</p></WorkbenchRecord>
      {workbenchFixtureShopping.map((entity) => <WorkbenchRecord key={entity.ref.id} entity={entity.ref} title={entity.title} group="workbench-fixture-shopping"><Link href={entity.href} className="block p-3 text-sm underline">{entity.title}</Link></WorkbenchRecord>)}
    </section>
  </div>;
}
/** Available only through the existing E2E_MOBILE_HARNESS-gated route. CI blocks every write. */
export function WorkbenchFixture({ pdf = false }: { pdf?: boolean }) {
  return <WorkspaceIdentityBoundary ownerId="synthetic-workbench-owner" revision="workbench-fixture-v1"><AppShell presentationPathname="/notes"><FixtureContent pdf={pdf} /></AppShell></WorkspaceIdentityBoundary>;
}
