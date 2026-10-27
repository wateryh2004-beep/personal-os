"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { lifeFieldInputSchema, type LifeFieldInput, type LifeFieldRow } from "@/features/life/contracts";
import { useLifeMutation } from "./use-life-mutation";
import { useLifeDialogFocus } from "@/components/life/use-life-dialog-focus";
import styles from "./life-field.module.css";

type WithoutRequest<T> = T extends { requestId: string }
  ? Omit<T, "requestId">
  : never;
export type LifeChange = {
  warnings?: string[];
  title: string;
  details: { id: string; title: string; change: string }[];
  input: WithoutRequest<LifeFieldInput>;
};
export function LifeConfirm({
  change,
  onClose,
  onSaved,
  requestId: suppliedRequestId,
  onSubmitted,
  resumeReadOnly = false,
}: {
  change: LifeChange;
  onClose: () => void;
  onSaved: (rows: LifeFieldRow[]) => void;
  requestId?: string;
  onSubmitted?: (input: LifeFieldInput) => void;
  resumeReadOnly?: boolean;
}) {
  const focus = useLifeDialogFocus();
  const [generatedRequestId] = useState(() => crypto.randomUUID());
  const parsed = lifeFieldInputSchema.safeParse({ ...change.input, requestId: suppliedRequestId ?? generatedRequestId });
  const signature = JSON.stringify(parsed.success ? parsed.data : { input: change.input, requestId: suppliedRequestId ?? generatedRequestId });
  const identity = useRef<{ signature: string; token: symbol } | null>(null), busy = useRef<symbol | null>(null);
  const [attempt, setAttempt] = useState<{ signature: string; input: LifeFieldInput } | null>(null);
  const [reading, setReading] = useState<{ signature: string; pending: boolean } | null>(null);
  const [noticeState, setNoticeState] = useState<{ signature: string; text: string } | null>(null);
  const notice = noticeState?.signature === signature ? noticeState.text : "";
  const setNotice = (text: string) => setNoticeState({ signature, text });
  useLayoutEffect(() => { const value = { signature, token: Symbol(signature) }; identity.current = value; busy.current = null; return () => { if (identity.current === value) identity.current = null; }; }, [signature]);
  const frozen = attempt?.signature === signature ? attempt.input : null;
  const readOnly = resumeReadOnly || frozen !== null;
  const readPending = reading?.signature === signature && reading.pending;
  const mutation = useLifeMutation();
  const router = useRouter();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (mutation.pending) return false;
        if (!open) onClose();
      }}
    >
      <DialogContent {...focus}>
        <DialogHeader>
          <DialogTitle>{change.title}</DialogTitle>
          <DialogDescription>
            核对后确认保存。取消不会修改记录。
          </DialogDescription>
        </DialogHeader>
        {change.warnings?.length ? (
          <div role="status" className={styles.notice}>
            {change.warnings.map((warning, index) => (
              <p key={index}>{warning}</p>
            ))}
          </div>
        ) : null}
        <ul className={styles.preview}>
          {change.details.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <p>{item.change}</p>
            </li>
          ))}
        </ul>
        {mutation.error ? (
          <p role="alert" className={styles.error}>
            {mutation.error}
            <button
              className={styles.action}
              onClick={() => {
                onClose();
                router.refresh();
              }}
            >
              读取最新内容
            </button>
          </p>
        ) : null}
        {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
        <div className={styles.actions}>
          <Button
            variant="outline"
            disabled={mutation.pending}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            disabled={mutation.pending || readPending}
            onClick={async () => {
              if (busy.current || !parsed.success) { if (!parsed.success) setNotice("请先核对预览内容与原提交编号，尚未发出请求。"); return; }
              const ticket = identity.current, token = Symbol("life-confirm"); busy.current = token;
              const current = () => identity.current === ticket && ticket?.signature === signature;
              setNotice("");
              const input = frozen ?? parsed.data;
              try {
                if (readOnly) {
                  setReading({ signature, pending: true });
                  const outcome = await mutation.reconcile(input);
                  if (!current() || !outcome) return;
                  if (outcome.status === "saved" && outcome.receiptStatus === "available") onSaved(outcome.rows);
                  else setNotice(outcome.status === "saved" ? "原保存已撤回；当前记录已核对，不会重新保存。" : outcome.status === "missing" ? "目前尚未核对到原保存记录。不会自动重发，输入已保留。" : outcome.status === "rejected" ? "原提交内容或版本不匹配，请保留输入并读取最新内容。" : "原保存结果仍待核对，不会重复提交。");
                } else {
                  setAttempt({ signature, input });
                  try { onSubmitted?.(input); } catch { setAttempt(null); setNotice("未能保留原提交意图，尚未发出保存请求。"); return; }
                  const rows = await mutation.save(input, change.title);
                  if (current() && rows) onSaved(rows);
                }
              } finally {
                if (busy.current === token) busy.current = null;
                if (current()) setReading({ signature, pending: false });
              }
            }}
          >
            {mutation.pending ? "保存中…" : readPending ? "正在核对原保存…" : readOnly ? "核对原保存" : "确认保存"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
