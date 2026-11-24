import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Sparkles } from "lucide-react"
import type { SetupFact } from "@adt/types"
import { FACT_SHORT } from "../../../../engine/words"
import { FACT_HINT } from "../../../chat/words"
import "./question.css"

/**
 * Smart default (d21): only the assistant's guess, with a soft pulse and one button to confirm it;
 * the other answers wait behind a quiet link.
 */
export function SmartDefault({ fact, onAnswer, onOthers }: { fact: SetupFact; onAnswer: (value: string) => void; onOthers: () => void }) {
  const { i18n } = useLingui()
  return (
    <div className="flex flex-col gap-3 p-1.5">
      <div className="qd21-rec relative flex items-center gap-3 rounded-[16px] px-3.5 py-3 ring-2 ring-brand-500">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-200">
          <Sparkles className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-semibold">{i18n._(FACT_SHORT[fact.id][fact.value]!)}</span>
            <span className="whitespace-nowrap rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              <Trans>My guess</Trans>
            </span>
          </span>
          <span className="text-[13px] text-muted-foreground">{i18n._(FACT_HINT[fact.id]![fact.value]!)}</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 px-1">
        <button type="button" onClick={onOthers} className="rounded-full px-1.5 py-1 text-[13px] font-medium text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-brand-400">
          <Trans>Other answers</Trans>
        </button>
        <button type="button" data-q-first="" onClick={() => onAnswer(fact.value)} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-brand-600 px-5 text-[15px] font-semibold text-primary-foreground shadow-[0_8px_20px_-8px_rgba(43,127,255,0.8)] transition-[transform,background-color] duration-150 hover:bg-brand-600/90 active:scale-[0.97]">
          <Check className="size-4 stroke-[2.5]" />
          <Trans>Use this</Trans>
        </button>
      </div>
    </div>
  )
}
