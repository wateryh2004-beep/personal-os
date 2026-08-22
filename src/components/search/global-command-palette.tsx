"use client";

import dynamic from "next/dynamic";

export type CommandCenterSection = "search" | "quick";

type GlobalCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: CommandCenterSection;
};

// Search pulls in cmdk, the global search hook, and multiple action stubs. Keep
// that code out of the persistent AppShell bundle until the command center is
// actually opened.
const LazyGlobalCommandPalette = dynamic(
  () => import("@/components/search/global-command-palette-impl").then((module) => module.GlobalCommandPalette),
  { ssr: false },
);

export function GlobalCommandPalette(props: GlobalCommandPaletteProps) {
  if (!props.open) return null;
  return <LazyGlobalCommandPalette {...props} />;
}
