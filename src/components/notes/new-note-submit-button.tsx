"use client";

import { useFormStatus } from "react-dom";
import { FilePlus2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The Server Action still owns the authoritative create/redirect. Display an
 * immediate truthful pending state while it runs, and prevent repeat submits.
 * This component must be rendered inside its associated form.
 */
export function NewNoteSubmitButton({
  compact = false,
  iconOnly = false,
  className,
}: {
  compact?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const label = pending ? "正在创建笔记" : "新建笔记";

  return (
    <Button
      type="submit"
      size={iconOnly ? "icon-xs" : "sm"}
      className={className}
      aria-label={label}
      title={label}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FilePlus2 aria-hidden="true" />}
      {!iconOnly && (
        <span className={compact ? "hidden md:inline" : undefined}>
          {pending ? "正在创建…" : "新建笔记"}
        </span>
      )}
    </Button>
  );
}
