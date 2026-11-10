import { cn } from "@/lib/utils"

export function SkeletonBar({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded bg-muted-foreground/12 motion-safe:animate-pulse", className)} />
}

export function SkeletonLine({ className }: { className?: string }) {
  return (
    <span aria-hidden className="flex h-[1lh] items-center">
      <SkeletonBar className={cn("h-[0.62em]", className)} />
    </span>
  )
}
