import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { CircleHelp, Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { Setting } from "./setup"

const CONFIDENCE = { low: msg`Low confidence`, medium: msg`Medium confidence`, high: msg`High confidence` }

/** True when the AI weighed this setting between two options and the value is still its pick. */
export function isUnsure(setting: Setting) {
  return setting.source === "ai" && setting.decision.alternative !== null
}

/** "Not sure" beside a setting the AI left between two options (until the user settles it). */
export function NotSureTag({ setting }: { setting: Setting }) {
  if (!isUnsure(setting)) return null
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
      <CircleHelp className="size-3" />
      <Trans>Not sure</Trans>
    </span>
  )
}

/**
 * Why the AI picked a setting, in its own words (already in the user's language): the reason, the
 * other option it weighed and why, the sampled pages it based this on, and how sure it was.
 */
export function WhyPopover({ setting, className }: { setting: Setting; className?: string }) {
  const { t, i18n } = useLingui()
  const d = setting.decision
  if (!d.reason) return null
  const alternative = d.alternative ? (setting.choices.find((c) => c.value === d.alternative)?.title ?? d.alternative) : null
  const pages = d.evidencePages.join(", ")
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={t`Why the AI picked this`} className={cn("grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground", className)}>
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-0">
        <div className="flex flex-col gap-2.5 p-3.5 text-[12.5px] leading-relaxed">
          <p className="font-semibold text-foreground">
            <Trans>Why {setting.answer}</Trans>
          </p>
          <p className="text-muted-foreground">{d.reason}</p>
          {alternative && (
            <div className="rounded-lg bg-amber-50 px-2.5 py-2 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/25">
              <p className="font-semibold">
                <Trans>Also possible: {alternative}</Trans>
              </p>
              {d.ambiguityReason && <p className="mt-0.5">{d.ambiguityReason}</p>}
            </div>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-2 border-t px-3.5 py-2 text-[11.5px] text-muted-foreground">
          {d.evidencePages.length === 1 && <Trans>Based on page {pages}</Trans>}
          {d.evidencePages.length > 1 && <Trans>Based on pages {pages}</Trans>}
          {d.evidencePages.length > 0 && <span aria-hidden>·</span>}
          {i18n._(CONFIDENCE[d.confidence])}
        </p>
      </PopoverContent>
    </Popover>
  )
}
