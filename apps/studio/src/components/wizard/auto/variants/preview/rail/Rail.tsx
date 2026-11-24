import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupBookFactId, SetupSettingId } from "@adt/types"
import { Lock, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { SETTING_IDS } from "../../../engine/answers"
import { SETTING_ICON, SETTING_LABEL } from "../labels"
import type { CanvasSetup } from "../useSetup"
import { BookFacts } from "./BookFacts"
import { SettingRow } from "./SettingRow"

/** The rail while the engine reads: the setting names are known, their values are on their way. */
function Pending({ stopped }: { stopped?: boolean }) {
  const { i18n } = useLingui()
  return (
    <ul className={cn("flex flex-col gap-0.5", stopped && "opacity-50")} aria-busy={!stopped}>
      {SETTING_IDS.map((id, i) => {
        const Icon = SETTING_ICON[id]
        return (
          <li key={id} className="flex items-center gap-3 px-2.5 py-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground/70">
              <Icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-muted-foreground">{i18n._(SETTING_LABEL[id])}</span>
              <span className={cn("h-3 rounded-full bg-muted-foreground/15", !stopped && "motion-safe:animate-pulse")} style={{ width: `${[58, 46, 34, 40, 28, 36][i]}%`, animationDelay: `${i * 120}ms` }} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Summary({ setup }: { setup: CanvasSetup }) {
  const changed = SETTING_IDS.filter((id) => setup.source(id) !== "ai").length
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700 ring-1 ring-brand-200">
      <Sparkles className="size-3" />
      {changed === 0 ? <Trans>All picked by AI</Trans> : <Trans>{changed} set by you</Trans>}
    </span>
  )
}

/**
 * The settings beside the preview, with the wizard's names: each one's value and where it came
 * from (AI, your answer, changed); locked ones say so. Then what the engine found in the book.
 */
export function Rail({ setup, stopped, onCompare, className }: { setup: CanvasSetup | null; stopped?: boolean; onCompare: (fact: SetupBookFactId) => void; className?: string }) {
  const [open, setOpen] = useState<SetupSettingId | null>(null)
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="flex flex-col gap-2">
        {setup && (
          <div className="px-1">
            <Summary setup={setup} />
          </div>
        )}
        {setup ? (
          <ul className="flex flex-col gap-0.5">
            {SETTING_IDS.map((id, i) => (
              <SettingRow key={id} id={id} index={i} setup={setup} open={open === id} onToggle={() => setOpen(open === id ? null : id)} />
            ))}
          </ul>
        ) : (
          <Pending stopped={stopped} />
        )}
        {setup && setup.rec.lockedSettings.length > 0 && (
          <p className="flex items-center gap-1.5 px-1 text-[11.5px] text-muted-foreground">
            <Lock className="size-3" />
            <Trans>Fixed once the book is created</Trans>
          </p>
        )}
      </div>
      {setup && <BookFacts setup={setup} onCompare={onCompare} />}
    </div>
  )
}
