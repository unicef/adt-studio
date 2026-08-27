import { cn } from "@/lib/utils"

export function OnboardingProgress({
  total,
  current,
}: {
  total: number
  current: number
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === current
              ? "w-8 bg-[var(--ob-accent)]"
              : i < current
                ? "w-1.5 bg-[rgba(var(--ob-accent-rgb),0.55)]"
                : "w-1.5 bg-border",
          )}
        />
      ))}
    </div>
  )
}
