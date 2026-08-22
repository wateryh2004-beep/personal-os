import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("ui-skeleton-shimmer rounded-[var(--radius-md)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
