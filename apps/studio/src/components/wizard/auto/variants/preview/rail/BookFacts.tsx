import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupBookFactId } from "@adt/types"
import { CircleHelp, Columns2, Info, Languages, ScanText } from "lucide-react"
import { cn } from "@/lib/utils"
import { FACT_IDS } from "../../../engine/answers"
import { FACT_SHORT, TEXT_LAYER } from "../../../engine/words"
import { FACT_NAME, PAGE_STORAGE, TEXT_LAYER_SHORT } from "../labels"
import type { CanvasSetup } from "../useSetup"

function languageName(code: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * What the engine found about the book: what it measured in the PDF, and its answers to the four
 * facts the settings follow from. Any fact that changes a setting can be compared on the stage.
 */
export function BookFacts({ setup, onCompare }: { setup: CanvasSetup; onCompare: (fact: SetupBookFactId) => void }) {
  const { i18n } = useLingui()
  const { rec, answers, answered } = setup
  const m = rec.measured
  return (
    <div className="flex flex-col gap-3">
      <h3 className="px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Trans>What we found</Trans>
      </h3>
      <ul className="flex flex-col gap-1.5 text-[13px]">
        <li className="flex items-start gap-2.5 px-1">
          <Columns2 className="mt-0.5 size-4 shrink-0 text-brand-600" />
          <span>{i18n._(PAGE_STORAGE[m.pageStorage])}</span>
        </li>
        <li className="flex items-start gap-2.5 px-1" title={TEXT_LAYER[m.textLayer] ? i18n._(TEXT_LAYER[m.textLayer]) : undefined}>
          <ScanText className="mt-0.5 size-4 shrink-0 text-brand-600" />
          <span>
            <span className="font-medium">{i18n._(TEXT_LAYER_SHORT[m.textLayer])}</span>
            {TEXT_LAYER[m.textLayer] && <span className="block text-[12px] leading-snug text-muted-foreground">{i18n._(TEXT_LAYER[m.textLayer])}</span>}
          </span>
        </li>
        {m.language && (
          <li className="flex items-start gap-2.5 px-1">
            <Languages className="mt-0.5 size-4 shrink-0 text-brand-600" />
            <span>{languageName(m.language, i18n.locale)}</span>
          </li>
        )}
      </ul>
      <ul className="flex flex-col gap-1">
        {FACT_IDS.map((id) => {
          const fact = rec.facts.find((f) => f.id === id)
          if (!fact) return null
          const unsure = fact.ask && !answered.includes(id)
          const name = i18n._(FACT_NAME[id])
          return (
            <li key={id} className="flex items-center gap-2 rounded-xl px-1 py-1">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[11.5px] text-muted-foreground">{name}</span>
                <span className="truncate text-[13.5px] font-semibold">{i18n._(FACT_SHORT[id][answers[id]])}</span>
              </span>
              {unsure && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                  <CircleHelp className="size-3" />
                  <Trans>Unsure</Trans>
                </span>
              )}
              {fact.matters && (
                <button type="button" onClick={() => onCompare(id)} className={cn("focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold text-brand-700 transition-colors hover:bg-brand-50")}>
                  <Trans>Compare</Trans>
                  <span className="sr-only"> {name}</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {!rec.secondOpinion && (
        <p className="flex items-start gap-2 rounded-xl bg-muted/70 px-3 py-2 text-[12px] leading-snug text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <Trans>Only one of the two AI readings finished, so nothing was double-checked. Give the preview a closer look.</Trans>
        </p>
      )}
    </div>
  )
}
