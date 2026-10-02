import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-control)] px-3 py-2.5 text-base text-foreground transition-[background-color,box-shadow,opacity] ui-transition outline-none placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus-visible:bg-[var(--surface-canvas)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_60%,transparent)] disabled:cursor-not-allowed disabled:bg-[var(--surface-control)] disabled:opacity-55 aria-invalid:ring-2 aria-invalid:ring-destructive/15 md:text-[14px]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
