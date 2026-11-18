"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
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
  const noteIdInput = useRef<HTMLInputElement>(null);

  // A form keeps the same UUID after an uncertain timeout/retry. Generate it
  // after hydration to avoid a server/client mismatch; unhydrated submission
  // still works via the server-generated UUID fallback.
  useEffect(() => {
    if (noteIdInput.current && !noteIdInput.current.value) {
      noteIdInput.current.value = crypto.randomUUID();
    }
  }, []);

  const label = pending ? "正在创建笔记" : "新建笔记";

  return (
    <>
    <input ref={noteIdInput} type="hidden" name="client_note_id" defaultValue="" />
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
    </>
  );
}
