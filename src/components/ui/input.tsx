import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 appearance-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-control)] px-3 py-1 text-base text-foreground transition-[background-color,box-shadow,opacity] ui-transition outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-foreground placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus-visible:bg-[var(--surface-canvas)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_60%,transparent)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--surface-control)] disabled:opacity-55 aria-invalid:ring-2 aria-invalid:ring-destructive/15 md:text-[14px]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
