import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 appearance-none rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-canvas)] px-3 py-1 text-base text-foreground transition-[border-color,background-color,box-shadow,opacity] ui-transition outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-foreground placeholder:text-[var(--text-tertiary)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[var(--surface-control)] disabled:opacity-55 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15 md:text-[13px]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
