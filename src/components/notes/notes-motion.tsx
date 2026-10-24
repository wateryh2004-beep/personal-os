"use client";

import type { ReactNode } from "react";
import { MotionBoundary } from "@/components/shared/motion-boundary";
import { cn } from "@/lib/utils";

/** Identity belongs to the note, so Back can find the same title again. */
export function NoteTitleMotion({ noteId, children, className }: { noteId: string; children: ReactNode; className?: string }) {
  return <MotionBoundary name={`note-title-${noteId}`} share="note-title">
    <div className={cn("note-title-anchor min-w-0", className)}>{children}</div>
  </MotionBoundary>;
}

/** Explicit hierarchy for links; browser history without a type stays neutral. */
export function NotesSurfaceMotion({ children }: { children: ReactNode }) {
  return <MotionBoundary name="notes-surface"
    share={{ "note-open": "notes-open", "note-return": "notes-return", default: "notes-crossfade" }}
    enter={{ "note-open": "notes-open", "note-return": "notes-return", default: "notes-crossfade" }}
    exit={{ "note-open": "notes-open", "note-return": "notes-return", default: "notes-crossfade" }}>
    {children}
  </MotionBoundary>;
}
