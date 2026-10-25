"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LifeFieldInput, LifeFieldRow } from "@/features/life/contracts";
import { useLifeMutation } from "./use-life-mutation";
import { useLifeDialogFocus } from "@/components/life/use-life-dialog-focus";
import styles from "./life-field.module.css";

type WithoutRequest<T> = T extends { requestId: string } ? Omit<T, "requestId"> : never;
export type LifeChange = { title: string; details: { id: string; title: string; change: string }[]; input: WithoutRequest<LifeFieldInput> };
export function LifeConfirm({ change, onClose, onSaved }: { change: LifeChange; onClose: () => void; onSaved: (rows: LifeFieldRow[]) => void }) {
  const focus=useLifeDialogFocus();
  const requestId = useRef(crypto.randomUUID()); const mutation = useLifeMutation(); const router = useRouter();
  return <Dialog open onOpenChange={(open) => { if(mutation.pending)return false;if (!open) onClose(); }}><DialogContent {...focus}><DialogHeader><DialogTitle>{change.title}</DialogTitle><DialogDescription>核对后确认保存。取消不会修改记录。</DialogDescription></DialogHeader><ul className={styles.preview}>{change.details.map((item) => <li key={item.id}><strong>{item.title}</strong><p>{item.change}</p></li>)}</ul>{mutation.error ? <p role="alert" className={styles.error}>{mutation.error}<button className={styles.action} onClick={() => { onClose(); router.refresh(); }}>读取最新内容</button></p> : null}<div className={styles.actions}><Button variant="outline" disabled={mutation.pending} onClick={onClose}>取消</Button><Button disabled={mutation.pending} onClick={async () => { const rows = await mutation.save({ ...change.input, requestId: requestId.current } as LifeFieldInput, change.title); if (rows) onSaved(rows); }}>{mutation.pending ? "保存中…" : "确认保存"}</Button></div></DialogContent></Dialog>;
}
