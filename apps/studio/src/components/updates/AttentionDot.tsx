import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function AttentionDot({ className }: { className?: string }) {
  const { t } = useLingui()

  return (
    <span
      role="status"
      aria-label={t`New`}
      className={cn(
        "size-2 shrink-0 rounded-full bg-amber-500 duration-300 animate-in fade-in zoom-in-50 motion-reduce:animate-none",
        className,
      )}
    />
  )
}
