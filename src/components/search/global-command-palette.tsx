"use client";

import { lazy, Suspense, type RefObject } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PanelPresence } from "@/components/shared/panel-presence";
import { useAnchoredDialog } from "@/components/shared/use-anchored-dialog";

export type CommandCenterSection = "search" | "quick";

type GlobalCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: CommandCenterSection;
  anchorRef?: RefObject<HTMLElement | null>;
  onCloseAutoFocus?: (event: Event) => void;
};

// Search pulls in cmdk, the global search hook, and multiple action stubs. Keep
// that code out of the persistent AppShell bundle until the command center is
// actually opened.
const LazyGlobalCommandPalette = lazy(
  () => import("@/components/search/global-command-palette-impl").then((module) => ({ default: module.GlobalCommandPalette })),
);

export function GlobalCommandPalette(props: GlobalCommandPaletteProps) {
  const contentRef = useAnchoredDialog(props.open, props.anchorRef);
  return <PanelPresence open={props.open}><Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent ref={contentRef} id="global-command-palette" className="global-command-surface" onCloseAutoFocus={props.onCloseAutoFocus}>
      <DialogHeader className="command-surface-heading">
        <DialogTitle>{props.initialSection === "quick" ? "快速新建" : "搜索"}</DialogTitle>
        <DialogDescription className="sr-only">搜索资料、打开页面或快速新建</DialogDescription>
      </DialogHeader>
      <div className="command-surface-body"><Suspense fallback={<div role="status" className="command-loading"><div className="command-loading-field" /><p>正在加载搜索…</p></div>}>
        <LazyGlobalCommandPalette open={props.open} onOpenChange={props.onOpenChange} initialSection={props.initialSection} embedded />
      </Suspense></div>
    </DialogContent>
  </Dialog></PanelPresence>;
}
