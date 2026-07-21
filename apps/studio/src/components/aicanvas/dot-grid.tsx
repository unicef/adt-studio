import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function DotGrid({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dot-grid"
      {...props}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 bg-[radial-gradient(circle,currentColor_1px,transparent_1px)] text-foreground/15 [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_78%)]",
        className,
      )}
    />
  )
}

export default DotGrid
