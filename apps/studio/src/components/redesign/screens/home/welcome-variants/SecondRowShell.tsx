import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * Shared scaffolding for the sample-book welcome variants so every second row uses the
 * same header rhythm, eyebrow, and surface treatment. Keeps the variants visually
 * consistent and the markup DRY.
 *
 * Type scale (single source of truth for these variants):
 *   eyebrow   10px / uppercase / tracking-wide
 *   title     15px / semibold
 *   body      13px / relaxed / muted
 *   label     11px
 */

/** Consistent "Sample book" eyebrow badge. */
export function SampleEyebrow({ children }: { children?: ReactNode }) {
  return (
    <Badge variant="info" className="gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
      <Sparkles className="size-3" />
      {children ?? <Trans>Sample book</Trans>}
    </Badge>
  )
}

/** Section header with a consistent title/description rhythm and an optional aside slot. */
export function SecondRowHeader({
  title,
  description,
  aside,
}: {
  title: ReactNode
  description: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="mb-4 mt-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="mt-1 max-w-[64ch] text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {aside ? <div className="hidden shrink-0 sm:block">{aside}</div> : null}
    </div>
  )
}

/**
 * Shared surface for sample panels — consistent border, radius, and a dark-safe brand
 * tint (opacity-based, so it reads correctly in light and dark).
 */
export function SamplePanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-card bg-gradient-to-br from-brand-500/[0.06] via-transparent to-transparent",
        className,
      )}
    >
      {children}
    </div>
  )
}
