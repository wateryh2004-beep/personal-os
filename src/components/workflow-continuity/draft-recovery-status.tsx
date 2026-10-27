"use client";

import {useEffect,useState} from "react";
import {captureWorkspaceScope,registerWorkspaceScopeCleanup} from "@/lib/workspace-resource-cache";

export function DraftRecoveryStatus({ restored = false, recoveryUnavailable = false, dirty = true }: { restored?: boolean; recoveryUnavailable?: boolean; dirty?: boolean }) {
  const [origin]=useState(captureWorkspaceScope);
  const [revoked,setRevoked]=useState(false);
  useEffect(()=>registerWorkspaceScopeCleanup(()=>setRevoked(true)),[]);
  if(revoked||!origin())return <p role="status" className="text-xs leading-5 text-[var(--text-secondary)]">工作区已变化，请重新打开此编辑入口。原输入不会作为新工作区的提交。</p>;
  if (!dirty && !restored && !recoveryUnavailable) return null;
  return <p role="status" className="text-xs leading-5 text-[var(--text-secondary)]">{recoveryUnavailable ? "输入仍在此处，暂时无法在切页后恢复。" : restored ? "已恢复未保存内容 · 仅本标签页" : "本标签页 · 未保存"}</p>;
}
