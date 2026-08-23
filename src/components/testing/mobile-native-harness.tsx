"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SidePanelShell } from "@/components/shared/side-panel-shell";

export function MobileNativeHarness() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <main data-testid="mobile-native-harness" className="min-h-[100dvh] w-full overflow-x-hidden bg-[var(--surface-app)] p-4">
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

      <SidePanelShell open={panelOpen} onClose={() => setPanelOpen(false)} title="测试详情" ariaLabel="测试详情">
        <input data-testid="panel-input" className="h-11 w-full rounded-lg bg-[var(--surface-control)] px-3" placeholder="Panel input" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 24 }, (_, index) => <p key={index} className="text-sm">Long scroll row {index + 1}</p>)}
        </div>
      </SidePanelShell>
    </main>
  );
}
