import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { CircleHelp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Setting } from "../setup"

const CONFIDENCE = { low: msg`Low confidence`, medium: msg`Medium confidence`, high: msg`High confidence` }

/** True when the AI weighed this setting between two options, the value is still its pick and nobody settled it in Decide. */
export function isUnsure(setting: Setting) {
  return setting.source === "ai" && !setting.settled && setting.decision.alternative !== null
}

export function titleOf(setting: Setting, value: string) {
  return setting.choices.find((c) => c.value === value)?.title ?? value
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

/** The sampled pages a decision cites and how sure the AI was, as text for a hover hint. */
export function useEvidence(): (setting: Setting) => string {
  const { t, i18n } = useLingui()
  return (setting) => {
    const d = setting.decision
    const pages = d.evidencePages.join(", ")
    const cited = d.evidencePages.length === 1 ? t`Based on page ${pages}` : d.evidencePages.length > 1 ? t`Based on pages ${pages}` : ""
    return [cited, i18n._(CONFIDENCE[d.confidence])].filter(Boolean).join(" · ")
  }
}

/** For a setting the AI wasn't sure about: the other option it weighed, why, and a one-click switch to it. */
export function AlsoPossible({ setting, set, className }: { setting: Setting; set: (key: Setting["key"], value: string) => void; className?: string }) {
  const d = setting.decision
  if (!isUnsure(setting) || !d.alternative) return null
  const alternative = d.alternative
  const title = titleOf(setting, alternative)
  return (
    <div className={cn("rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] leading-snug text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/25", className)}>
      <span className="font-semibold">
        <Trans>{title} could also work.</Trans>
      </span>{" "}
      {d.ambiguityReason}{" "}
      <button type="button" onClick={() => set(setting.key, alternative)} className="font-semibold underline decoration-amber-400 underline-offset-2 transition-colors hover:text-amber-950 dark:hover:text-amber-100">
        <Trans>Use {title}</Trans>
      </button>
    </div>
  )
}

/** What a changed setting says instead of the AI's reason: what the AI had suggested, with a way back. */
export function Suggested({ setting, set }: { setting: Setting; set: (key: Setting["key"], value: string) => void }) {
  const title = titleOf(setting, setting.ai)
  return (
    <span>
      <Trans>The AI suggested {title}.</Trans>{" "}
      <button type="button" onClick={() => set(setting.key, setting.ai)} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 transition-colors hover:text-brand-800">
        <Trans>Use it</Trans>
      </button>
    </span>
  )
}
