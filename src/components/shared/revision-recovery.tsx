"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  captureWorkspaceScope,
  registerWorkspaceScopeCleanup,
} from "@/lib/workspace-resource-cache";

/** A read never edits the form. The caller must apply either explicit choice. */
export function useRevisionRecovery<T>() {
  const [latest, setLatest] = useState<T | null>(null);
  const [reading, setReading] = useState(false);
  const [showing, setShowing] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  useEffect(() => {
    const invalidate = () => {
      sequence.current += 1;
      setLatest(null);
      setShowing(false);
      setReading(false);
      setError("");
    };
    const unregister = registerWorkspaceScopeCleanup(invalidate);
    return () => {
      sequence.current += 1;
      unregister();
    };
  }, []);
  const read = async (load: () => Promise<T>) => {
    const ticket = ++sequence.current,
      current = captureWorkspaceScope();
    setReading(true);
    setError("");
    setShowing(false);
    try {
      const value = await load();
      if (current() && ticket === sequence.current) {
        setLatest(value);
        setShowing(true);
      }
    } catch (failure) {
      if (current() && ticket === sequence.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "最新内容暂时无法读取。当前输入保留。",
        );
    } finally {
      if (current() && ticket === sequence.current) setReading(false);
    }
  };
  return {
    latest,
    showing,
    reading,
    error,
    read,
    dismiss: () => setShowing(false),
  };
}

export function RevisionRecovery<T>({
  label,
  recovery,
  disabled,
  onRead,
  current,
  renderLatest,
  onKeep,
  onAdopt,
}: {
  label: string;
  recovery: ReturnType<typeof useRevisionRecovery<T>>;
  disabled?: boolean;
  onRead: () => void;
  current: ReactNode;
  renderLatest: (latest: T) => ReactNode;
  onKeep: (latest: T) => void;
  onAdopt: (latest: T) => void;
}) {
  return (
    <section
      aria-label={`${label}版本核对`}
      className="min-w-0 max-w-full space-y-3 rounded-lg border border-[var(--separator)] p-3 text-sm leading-[1.6] [overflow-wrap:anywhere]"
    >
      <Button
        type="button"
        variant="outline"
        className="h-auto min-h-11 min-w-0 max-w-full whitespace-normal py-2 leading-[1.6]"
        disabled={disabled || recovery.reading}
        onClick={onRead}
      >
        {recovery.reading
          ? "正在读取，仍可继续编辑…"
          : `读取最新${label}并对比`}
      </Button>
      {recovery.error ? <p role="alert">{recovery.error}</p> : null}
      {recovery.latest && recovery.showing ? (
        <>
          <p>
            读取不会替换输入。核对后选择；保留输入仍需再次保存，其他页面若再次修改，保存会重新检查版本。
          </p>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <section className="min-w-0 max-w-full">
              <h3 className="font-medium">当前输入 · 尚未保存</h3>
              {current}
            </section>
            <section className="min-w-0 max-w-full">
              <h3 className="font-medium">刚读取的已保存内容</h3>
              {renderLatest(recovery.latest)}
            </section>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-auto min-h-11 min-w-0 max-w-full whitespace-normal py-2 leading-[1.6]"
              disabled={disabled || recovery.reading}
              onClick={() => {
                onKeep(recovery.latest!);
                recovery.dismiss();
              }}
            >
              保留当前输入，按最新版本继续编辑
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 min-w-0 max-w-full whitespace-normal py-2 leading-[1.6]"
              disabled={disabled || recovery.reading}
              onClick={() => {
                onAdopt(recovery.latest!);
                recovery.dismiss();
              }}
            >
              采用最新内容，替换当前输入
            </Button>
            <Button type="button" variant="ghost" className="h-auto min-h-11 min-w-0 max-w-full whitespace-normal py-2 leading-[1.6]" onClick={recovery.dismiss}>
              暂不处理
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
