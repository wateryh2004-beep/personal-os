"use client";

import { useState } from "react";
import { InterviewFastWorkspace } from "@/components/career/interview/interview-fast-workspace";
import { TodayPriorities } from "@/components/today/today-priorities";
import { PracticeReflectionFields } from "@/components/career/interview/practice-reflection-fields";
import { ActionFeedbackProvider } from "@/components/shared/action-feedback";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SidePanelShell } from "@/components/shared/side-panel-shell";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";

export function MobileNativeHarness() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <main data-testid="mobile-native-harness" className="min-h-[100dvh] w-full overflow-x-hidden bg-[var(--surface-app)] p-4 pb-[calc(var(--tab-bar-height)+1rem)]">
      <div className="mx-auto max-w-md space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Mobile Native E2E</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">共享移动端 overlay、键盘与 PWA 行为的无数据测试页。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="open-dialog" type="button" onClick={() => setDialogOpen(true)} className="min-h-11 rounded-xl bg-[var(--surface-control)] px-4">打开 Dialog</button>
          <button data-testid="open-sheet" type="button" onClick={() => setSheetOpen(true)} className="min-h-11 rounded-xl bg-[var(--surface-control)] px-4">打开 Sheet</button>
          <button data-testid="open-panel" type="button" onClick={() => setPanelOpen(true)} className="min-h-11 rounded-xl bg-[var(--surface-control)] px-4">打开 Panel</button>
        </div>
        <p className="break-words text-sm leading-6 text-[var(--text-secondary)]">360 / 390 / 412 / 430 px responsive contract · no private fixture data · no authenticated content.</p>
      </div>

      <div data-testid="daily-flow-harness" className="mx-auto my-6 max-w-md space-y-6">
        <ActionFeedbackProvider><TodayPriorities focus={{ date: "2026-10-01", selectedIds: [], selectedTasks: [], available: true, candidates: [1,2,3,4].map((n) => ({ id: `c0000000-0000-4000-8000-00000000000${n}`, title: `E2E 未定期任务 ${n} · 用于移动端布局验证`, status: "notStarted", due_at: null, importance: "normal" })) }} /></ActionFeedbackProvider>
        <form onSubmit={(event) => event.preventDefault()} aria-label="练习表单测试"><PracticeReflectionFields /></form>
      </div>

      <section data-testid="interview-harness" className="mx-auto my-8 max-w-5xl">
        <InterviewFastWorkspace
          targets={[{ id: "e2e-target", title: "E2E Target", organization: "E2E Company", role: "MT" }]}
          items={[null, null, "e2e-target"].map((contextId, index) => ({
            preparationId: `e2e-prep-${index}`, questionId: `e2e-question-${index}`, contextId,
            prompt: `E2E 面试问题 ${index}`, category: "resume", categoryLabel: "简历",
            style: "standard", subcategory: null, competencies: [],
            thoughts: `E2E 思路 ${index}`,
            answer: index === 1 ? `${"E2E 中文参考答案：先回答问题，再用可核对的事实解释。\n\n".repeat(10)}${"E2E English reference answer: state the answer, then explain with verifiable facts.\n\n".repeat(10)}` : `E2E 答案 ${index}`,
            answerId: index === 1 ? "e2e-draft" : null,
            answerMeta: index === 1 ? { status: "draft", source: "ai_draft", language: "bilingual", confirmed_at: null, version_number: 2 } : null,
          }))}
          initialContextId="" initialQuestionId="" initialCategory="all"
        />
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogTitle>测试 Dialog</DialogTitle>
          <DialogDescription>打开后不应在手机端自动弹出软键盘。</DialogDescription>
          <input data-testid="dialog-input" className="h-11 rounded-lg bg-[var(--surface-control)] px-3" placeholder="Dialog input" />
        </DialogContent>
      </Dialog>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left">
          <SheetTitle>测试 Sheet</SheetTitle>
          <SheetDescription>Android Back 应优先关闭抽屉。</SheetDescription>
          <input data-testid="sheet-input" className="mx-4 h-11 rounded-lg bg-[var(--surface-control)] px-3" placeholder="Sheet input" />
        </SheetContent>
      </Sheet>

      <MobileTabBar onOpenMore={() => {}} />

      <SidePanelShell open={panelOpen} onClose={() => setPanelOpen(false)} title="测试详情" ariaLabel="测试详情">
        <input data-testid="panel-input" className="h-11 w-full rounded-lg bg-[var(--surface-control)] px-3" placeholder="Panel input" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 24 }, (_, index) => <p key={index} className="text-sm">Long scroll row {index + 1}</p>)}
        </div>
      </SidePanelShell>
    </main>
  );
}

