import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Lock, Settings2 } from "lucide-react"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { strategiesFor, type Derived, type SettingValue } from "../../../chat/useAnswers"
import { SETTING_LABEL, SETTING_OPTIONS, valueTitle } from "../../../chat/words"
import "./evidence.css"

/** One underlined word in the sentence: a setting's value, opening a small menu of the others. */
function Token({ id, derived, locked, onChange }: { id: SetupSettingId; derived: Derived; locked: boolean; onChange: (id: SetupSettingId, value: SettingValue) => void }) {
  const { t, i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const current = derived.effective[id]?.value
  const title = valueTitle(id, current)
  const value = title ? i18n._(title) : String(current)
  const name = i18n._(SETTING_LABEL[id])
  const only = id === "renderStrategy" ? strategiesFor(derived.effective.preset?.value) : null
  const options = SETTING_OPTIONS[id].filter((o) => !only || only.includes(String(o.value)))
  const changed = derived.source(id) !== "ai"
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={t`${name}: ${value}. Change`} className={cn("ev-tok", changed && "is-changed")}>
          <span key={String(current)} className="ev-tok-roll">
            {value}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[220px] rounded-[14px] p-1.5 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.55)]">
        <p className="px-2 pb-1 pt-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{name}</p>
        <div role="group" aria-label={name} className="flex flex-col">
          {options.map((o) => {
            const on = o.value === current
            return (
              <button
                key={String(o.value)}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onChange(id, o.value)
                  setOpen(false)
                }}
                className={cn("flex items-center justify-between gap-2 rounded-[9px] px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-brand-50", on && "font-semibold text-brand-700")}
              >
                {i18n._(o.title)}
                {on && <Check className="size-3.5 stroke-[3]" />}
              </button>
            )
          })}
        </div>
        {locked && (
          <p className="mt-1 flex gap-1.5 border-t border-border/70 px-2 pb-0.5 pt-1.5 text-[11.5px] leading-snug text-muted-foreground">
            <Lock className="mt-0.5 size-3 shrink-0" />
            <Trans>Fixed once the book is created</Trans>
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The setup as one sentence ("Make a Storybook, laid out Reflowable, one Single Page at a time"),
 * Mad Libs style: each underlined value opens a small menu with the others. The rest follow in a
 * shorter line, in the wizard's names.
 */
export function SettingsSentence({ rec, derived, onChange, frozen, onAllSettings }: { rec: SetupRecommendation; derived: Derived; onChange: (id: SetupSettingId, value: SettingValue) => void; frozen: boolean; onAllSettings: () => void }) {
  const locked = new Set(rec.lockedSettings)
  const tok = (id: SetupSettingId) => <Token id={id} derived={derived} locked={locked.has(id)} onChange={onChange} />
  /* eslint-disable lingui/no-unlocalized-strings -- setting ids */
  const preset = tok("preset")
  const strategy = tok("renderStrategy")
  const grouping = tok("pageGrouping")
  const sections = tok("sectioningMode")
  const activities = tok("activitiesGenerator")
  const figures = tok("figureExtraction")
  /* eslint-enable lingui/no-unlocalized-strings */
  return (
    <div inert={frozen} className="flex flex-col gap-2">
      <p className="text-[18px] font-medium leading-[2] tracking-[-0.01em]">
        <Trans>
          Make a {preset} book, laid out {strategy}, one {grouping} at a time.
        </Trans>
      </p>
      <p className="text-[13.5px] leading-[2] text-muted-foreground">
        <Trans>
          Section Mode {sections}, Activities {activities}, Figure Extraction {figures}.
        </Trans>
      </p>
      <div className="flex justify-end">
        <button type="button" onClick={onAllSettings} className="-mr-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50">
          <Settings2 className="size-3.5" />
          <Trans>All settings</Trans>
        </button>
      </div>
    </div>
  )
}
