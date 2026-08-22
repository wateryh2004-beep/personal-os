import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-canvas)] px-3 py-2.5 text-base text-foreground transition-[border-color,background-color,box-shadow,opacity] ui-transition outline-none placeholder:text-[var(--text-tertiary)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[var(--surface-control)] disabled:opacity-55 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15 md:text-[13px]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
