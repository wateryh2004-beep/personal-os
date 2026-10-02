import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button pressable inline-flex shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-transparent bg-clip-padding text-[13px] font-medium tracking-[-0.008em] whitespace-nowrap outline-none select-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_60%,transparent)] disabled:pointer-events-none disabled:opacity-45 disabled:transform-none aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]",
        outline:
          "border-[var(--separator)] bg-[var(--material-thick)] text-foreground shadow-[var(--shadow-control)] hover:bg-[var(--surface-hover)] aria-expanded:bg-[var(--surface-hover)]",
        secondary:
          "bg-[var(--surface-control)] text-secondary-foreground hover:bg-[var(--surface-control-hover)] aria-expanded:bg-[var(--surface-control-hover)]",
        ghost:
          "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-foreground active:bg-[var(--surface-selected)] aria-expanded:bg-[var(--surface-selected)] aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:border-destructive/40 focus-visible:ring-destructive/15",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[var(--control-height)] gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-[var(--radius-sm)] px-2 text-[11px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[var(--control-height-sm)] gap-1 rounded-[var(--radius-md)] px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[var(--control-height-lg)] gap-1.5 px-3.5 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-[var(--control-height)]",
        "icon-xs": "size-6 rounded-[var(--radius-sm)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-[var(--radius-md)] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
