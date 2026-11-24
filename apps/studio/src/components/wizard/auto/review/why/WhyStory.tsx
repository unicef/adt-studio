import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Avatar } from "../../decide/intro/parts"
import type { Setting } from "../setup"
import { AlsoPossible, isUnsure, Suggested, useEvidence } from "./shared"

type Props = { settings: Setting[]; set: (key: Setting["key"], value: string) => void }

/** The AI's reason for a setting (or what it had suggested, once changed), with its pages and confidence on hover. */
function Reason({ s, set, className, label }: { s: Setting; set: Props["set"]; className?: string; label?: ReactNode }) {
  const evidence = useEvidence()
  return (
    <span className={cn("text-muted-foreground", className)} title={s.source === "ai" ? `${s.decision.reason}\n${evidence(s)}` : undefined}>
      {label}
      {s.source === "ai" ? s.decision.reason : <Suggested setting={s} set={set} />}
    </span>
  )
}

/**
 * "How I set it up" — the AI's reasons in the book card, in the assistant's voice, as a plain bullet
 * list ("Setting: reason") so the settings beside it stay clean. The bullet turns amber on a setting
 * the AI wasn't sure about, which shows the other option with a one-click switch; a change says what
 * the AI had suggested. Pages and confidence are in each line's hover hint.
 */
export function WhyStory({ settings, set, className }: Props & { className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-center gap-2">
        <Avatar size="sm" />
        <p className="text-sm font-semibold">
          <Trans>How I set it up</Trans>
        </p>
      </div>
      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[12.5px] leading-snug marker:text-muted-foreground/60">
        {settings.map((s) => (
          <li key={s.key} className={cn("pl-0.5", isUnsure(s) && "marker:text-amber-500")}>
            <div className="flex flex-col gap-1">
              <Reason s={s} set={set} className="line-clamp-2" label={<span className="font-medium text-foreground">{s.label}: </span>} />
              <AlsoPossible setting={s} set={set} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
