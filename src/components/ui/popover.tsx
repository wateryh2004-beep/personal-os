"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const PopoverOpenContext = React.createContext(true)

function Popover({ open: controlledOpen, defaultOpen, onOpenChange, ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const open = controlledOpen ?? internalOpen
  const changeOpen = React.useCallback((nextOpen: boolean) => {
    onOpenChange?.(nextOpen)
    if (controlledOpen === undefined) setInternalOpen(nextOpen)
  }, [controlledOpen, onOpenChange])
  return <PopoverOpenContext.Provider value={open}><PopoverPrimitive.Root data-slot="popover" open={open} onOpenChange={changeOpen} {...props} /></PopoverOpenContext.Provider>
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  portalContainer,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & { portalContainer?: HTMLElement | null }) {
  // Radix Presence keeps the closed content for its finite exit. Paint may
  // continue, but that layer no longer owns focus or accessibility.
  const open = React.useContext(PopoverOpenContext)
  return (
    <PopoverPrimitive.Portal container={portalContainer}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2 rounded-[14px] border border-[var(--separator)] bg-[var(--material-popover)] p-2.5 text-[13px] text-popover-foreground shadow-[var(--shadow-popover)] ui-panel-transition outline-hidden data-[side=bottom]:slide-in-from-top-0.5 data-[side=left]:slide-in-from-right-0.5 data-[side=right]:slide-in-from-left-0.5 data-[side=top]:slide-in-from-bottom-0.5 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className,
        )}
        {...props}
        inert={!open || props.inert || undefined}
        aria-hidden={open ? props["aria-hidden"] : true}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="popover-header" className={cn("flex flex-col gap-0.5", className)} {...props} />
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <div data-slot="popover-title" className={cn("text-[13px] font-semibold text-[var(--text-primary)]", className)} {...props} />
}

function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="popover-description" className={cn("text-[12px] leading-4 text-[var(--text-secondary)]", className)} {...props} />
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
