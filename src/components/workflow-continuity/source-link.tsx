"use client";

import { createContext, useContext, type ComponentProps } from "react";
import Link from "next/link";
import type { SourceSearchState } from "@/features/workflow-continuity/source-trail";

export type SourceNavigator = (destination: string, label?: string, search?: SourceSearchState) => boolean;
export const SourceNavigationContext = createContext<SourceNavigator | null>(null);
const unhandled: SourceNavigator = () => false;
export function useSourceNavigation() { return useContext(SourceNavigationContext) ?? unhandled; }

/** Only the persistent authenticated shell supplies capture/restore behavior.
 * Standalone domain views retain ordinary Next links without a router dependency. */
export function SourceLink({ sourceLabel, onNavigate, ...props }: ComponentProps<typeof Link> & { sourceLabel?: string }) {
  const navigate = useSourceNavigation();
  return <Link {...props} onNavigate={event => {
    let prevented = false;
    onNavigate?.({ preventDefault: () => { prevented = true; event.preventDefault(); } });
    if (!prevented && typeof props.href === "string" && navigate(props.href, sourceLabel)) event.preventDefault();
  }} />;
}
