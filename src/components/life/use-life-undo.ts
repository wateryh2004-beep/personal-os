"use client";
import { useEffect, useRef } from "react";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { readLifeReceiptState } from "@/features/life/actions";
import type { LifeFieldRow } from "@/features/life/contracts";

export function useLifeUndo(onState: (operation: string, rows: LifeFieldRow[]) => void) {
  const callback = useRef(onState);
  useEffect(() => { callback.current = onState; }, [onState]);
  useEffect(() => {
    let alive = true;const revisions=new Map<string,number>();
    const reconcile = async (event: Event) => {
      const receiptId = event instanceof CustomEvent ? event.detail?.receiptId : null;
      if (typeof receiptId !== "string") return;
      const currentScope=captureWorkspaceScope();
      const state = await readLifeReceiptState(receiptId).catch(() => null);
      if(!alive||!currentScope()||!state)return;
      const domain=state.operation.split("_")[0];
      const rows=state.rows.filter(row=>{const key=`${domain}:${row.trip_id?"stop":"record"}:${row.id}`;const revision=Number(row.mutation_revision??0);if(revision<(revisions.get(key)??0))return false;revisions.set(key,revision);return true;});
      if(rows.length)callback.current(state.operation,rows);
    };
    window.addEventListener("personal-os:operation-undone", reconcile);
    return () => { alive = false; window.removeEventListener("personal-os:operation-undone", reconcile); };
  }, []);
}
