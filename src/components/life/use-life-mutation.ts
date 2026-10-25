"use client";
import { useEffect, useRef, useState } from "react";
import { applyLifeFieldOperation } from "@/features/life/actions";
import type { LifeFieldInput, LifeFieldRow } from "@/features/life/contracts";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { publishOperationReceipt } from "@/features/workbench/operation-contracts";

export function useLifeMutation() {
  const busy = useRef(false);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(input: LifeFieldInput, message: string): Promise<LifeFieldRow[] | null> {
    if (busy.current) return null;
    const currentScope=captureWorkspaceScope();
    busy.current = true; setPending(true); setError("");
    try {
      const result = await applyLifeFieldOperation(input);
      if(!mounted.current||!currentScope())return null;
      if (!result.ok) { setError(result.message); return null; }
      if (!result.replayed) publishOperationReceipt({ receiptId: result.receiptId, message });
      return result.rows;
    } catch { if(mounted.current&&currentScope())setError("连接中断，暂时无法确认保存结果。请读取最新内容。"); return null; }
    finally { busy.current = false; if(mounted.current&&currentScope())setPending(false); }
  }
  return { pending, error, save, clearError: () => setError("") };
}
