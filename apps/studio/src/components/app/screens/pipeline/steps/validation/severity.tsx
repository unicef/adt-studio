import { Trans } from "@lingui/react/macro"
import type { AccessibilitySeverity } from "@/lib/accessibility-summary"
import { cn } from "@/lib/utils"

export const SEVERITY_ORDER: AccessibilitySeverity[] = ["critical", "serious", "moderate", "minor", "unknown"]

export const SEVERITY_RANK: Record<AccessibilitySeverity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
  unknown: 4,
}

const SEVERITY_DOT: Record<AccessibilitySeverity, string> = {
  critical: "bg-red-500",
  serious: "bg-orange-500",
  moderate: "bg-amber-400",
  minor: "bg-sky-400",
  unknown: "bg-muted-foreground/50",
}

export const REVIEW_DOT = "bg-muted-foreground/40 ring-1 ring-inset ring-muted-foreground/40"

export function SeverityDot({ severity, review = false, className }: { severity: AccessibilitySeverity; review?: boolean; className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", review ? REVIEW_DOT : SEVERITY_DOT[severity], className)} />
}

export function SeverityLabel({ severity }: { severity: AccessibilitySeverity }) {
  switch (severity) {
    case "critical":
      return <Trans>Critical</Trans>
    case "serious":
      return <Trans>Serious</Trans>
    case "moderate":
      return <Trans>Moderate</Trans>
    case "minor":
      return <Trans>Minor</Trans>
    default:
      return <Trans>Unknown</Trans>
  }
}
