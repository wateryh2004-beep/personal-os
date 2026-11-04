"use client";

import { createContext } from "react";

/** A document owns the toolbar host; the editor owns the action state and handlers. */
export type NoteHeaderActionsHost = {
  target: HTMLDivElement | null;
  showEditorActions: boolean;
};

export const NoteHeaderActionsContext = createContext<NoteHeaderActionsHost | null>(null);
