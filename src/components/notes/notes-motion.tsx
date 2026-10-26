"use client";

import { createContext, useContext, type ReactNode } from "react";
import { MotionBoundary } from "@/components/shared/motion-boundary";
import { cn } from "@/lib/utils";

/** References can display the route's note simultaneously; only the route owns its shared names. */
export const NoteMotionScopeContext = createContext<"route" | "reference">("route");

export function NotePaperMotion({ noteId }: { noteId: string }) {
  const scope = useContext(NoteMotionScopeContext);
  const paper = <span aria-hidden="true" className="note-paper-background" />;
  return scope === "route" ? <MotionBoundary name={`note-paper-${noteId}`} share="note-paper">{paper}</MotionBoundary> : paper;
}

/** Identity belongs to the note, so Back can find the same title again. */
export function NoteTitleMotion({ noteId, children, className, editableTitle }: { noteId: string; children: ReactNode; className?: string; editableTitle?: string }) {
  const scope = useContext(NoteMotionScopeContext);
  // Named ViewTransition participants do not receive pointer hits mid-flight.
  // Keep the real input/h1 outside the named presentation, so typing and a
  // rapid reverse action remain live throughout the paper's 620ms movement.
  if (editableTitle !== undefined && scope === "route") return <div className={cn("note-title-anchor note-editable-title-anchor min-w-0", className)}>
    <MotionBoundary name={`note-title-${noteId}`} share="note-title"><span aria-hidden="true" className="note-title-motion-face">{editableTitle || "无标题笔记"}</span></MotionBoundary>
    <div className="note-title-live">{children}</div>
  </div>;
  const title = <div className={cn("note-title-anchor min-w-0", className)}>{children}</div>;
  return scope === "route" ? <MotionBoundary name={`note-title-${noteId}`} share="note-title">{title}</MotionBoundary> : title;
}

/** Explicit hierarchy for links; browser history without a type stays neutral. */
export function NotesSurfaceMotion({ children }: { children: ReactNode }) {
  // Naming the whole shell makes all its controls unclickable during the
  // native transition. Only the non-interactive paper and title may be named.
  return <>{children}</>;
}
