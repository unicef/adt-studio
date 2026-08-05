import { useLingui } from "@lingui/react/macro"
import { Badge } from "@/components/ui/badge"
import type { AvailableRelease } from "@/hooks/use-update-status"
import { cn } from "@/lib/utils"

export function ReleaseDirectionBadge({
  direction,
  className,
}: {
  direction: AvailableRelease["direction"]
  className?: string
}) {
  const { t } = useLingui()
  const label =
    direction === "upgrade"
      ? t`New`
      : direction === "current"
        ? t`Current`
        : t`Earlier`

  return (
    <Badge
      variant={
        direction === "upgrade"
          ? "default"
          : direction === "current"
            ? "outline"
            : "secondary"
      }
      className={cn("text-[10px]", className)}
    >
      {label}
    </Badge>
  )
}
