"use client";
import { createContext, useContext } from "react";
import type { WorkbenchRef } from "@/features/workbench/contracts";
export type WorkbenchRecordEntry = { ref: WorkbenchRef; title: string; group: string; element: HTMLElement };
export type WorkbenchContextValue = {
  register(entry: WorkbenchRecordEntry): () => void;
  openPreview(ref: WorkbenchRef, group?: string, trigger?: HTMLElement): void;
  openReference(ref: WorkbenchRef): void;
  compare(refs?: WorkbenchRef[]): void;
  toggleSelection(ref: WorkbenchRef, group: string): void;
  isSelected(ref: WorkbenchRef): boolean;
  selected: WorkbenchRef[];
  clearSelection(): void;
};
export const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);
export function useWorkbench() {
  return useContext(WorkbenchContext);
}
