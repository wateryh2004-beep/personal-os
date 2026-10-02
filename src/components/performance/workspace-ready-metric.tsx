"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { perfMark, perfMeasure } from "@/lib/perf";

/** Mount inside a data-backed page, never its layout or loading fallback. */
export function WorkspaceReadyMetric({ workspace }: { workspace: string }) {
  const pathname = usePathname();
  useEffect(() => {
    perfMark("workspace-visible", { workspace });
    perfMeasure("workspace-data-ready", "navigation-click", { workspace, href: pathname });
  }, [pathname, workspace]);
  return null;
}
