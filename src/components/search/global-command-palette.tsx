"use client";

import { lazy, Suspense } from "react";
import { Dialog } from "@/components/ui/dialog";
import { LazyDialogPlaceholder } from "@/components/shared/lazy-surface-placeholder";

export type CommandCenterSection = "search" | "quick";

type GlobalCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: CommandCenterSection;
};

// Search pulls in cmdk, the global search hook, and multiple action stubs. Keep
// that code out of the persistent AppShell bundle until the command center is
// actually opened.
const LazyGlobalCommandPalette = lazy(
  () => import("@/components/search/global-command-palette-impl").then((module) => ({ default: module.GlobalCommandPalette })),
);

export function GlobalCommandPalette(props: GlobalCommandPaletteProps) {
  if (!props.open) return null;
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <Suspense fallback={<LazyDialogPlaceholder title="搜索 Personal OS" />}>
      <LazyGlobalCommandPalette {...props} contentOnly />
    </Suspense>
  </Dialog>;
}
