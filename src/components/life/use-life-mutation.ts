"use client";
import { useLifeVerificationTransport } from "@/features/life/verification-context";
import { useEffect, useRef, useState } from "react";
import { applyLifeFieldOperation, readLifeRequestOutcome } from "@/features/life/actions";
import type { LifeFieldInput, LifeFieldRow } from "@/features/life/contracts";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { publishOperationReceipt } from "@/features/workbench/operation-contracts";

export function useLifeMutation() {
  const transport = useLifeVerificationTransport();
  // A still-mounted confirmation never acquires a later owner's authority.
  const [originScope] = useState(() => captureWorkspaceScope());
  const busy = useRef(false);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(input: LifeFieldInput, message: string): Promise<LifeFieldRow[] | null> {
    if (busy.current || !mounted.current || !originScope()) return null;
    const currentScope=captureWorkspaceScope();
    busy.current = true; setPending(true); setError("");
    try {
      const result = await (transport?.apply ?? applyLifeFieldOperation)(input);
      if(!mounted.current||!originScope()||!currentScope())return null;
      if (!result.ok) { setError(result.message); return null; }
      if (!result.replayed) publishOperationReceipt({ receiptId: result.receiptId, message });
      return result.rows;
    } catch { if(mounted.current&&originScope()&&currentScope())setError("连接中断，暂时无法确认保存结果。请读取最新内容。"); return null; }
    finally { busy.current = false; if(mounted.current&&originScope()&&currentScope())setPending(false); }
  }
  async function reconcile(input: LifeFieldInput) {
    if (!mounted.current || !originScope()) return null;
    const currentScope = captureWorkspaceScope();
    const outcome = await (transport?.readRequest ?? readLifeRequestOutcome)(input);
    return mounted.current && originScope() && currentScope() ? outcome : null;
  }
  return { pending, error, save, reconcile, clearError: () => setError("") };
}
