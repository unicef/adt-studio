import { Trans, useLingui } from "@lingui/react/macro"
import { Check, FileText } from "lucide-react"
import type { SetupFact } from "@adt/types"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { FACT_SHORT } from "../../../../engine/words"
import { FACT_HINT } from "../../../chat/words"
import "./question.css"

/** The page the guess is read from, small, like the board's page chip. */
function Thumb({ file, page }: { file: File | null | undefined; page: number | undefined }) {
  const src = usePageThumb(file, page ?? 0, 80)
  return (
    <span className="grid h-[52px] w-[40px] shrink-0 place-items-center overflow-hidden rounded-[4px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.18)]">
      {src ? <img src={src} alt="" className="max-h-full max-w-full" /> : <FileText className="size-4 text-muted-foreground/50" />}
    </span>
  )
}

/**
 * Smart default (d21): one confirmation card. Only the assistant's guess shows, outlined in the
 * accent with a soft pulse and the page it was read from; one button confirms it, and the other
 * answers wait behind a quiet link.
 */
export function SmartDefault({ fact, file, onAnswer, onOthers }: { fact: SetupFact; file: File | null | undefined; onAnswer: (value: string) => void; onOthers: () => void }) {
  const { i18n } = useLingui()
  return (
    <div className="flex flex-col gap-3.5 p-2.5">
      <div className="qd21-rec relative flex items-center gap-3.5 rounded-[14px] px-3 py-2.5 ring-[1.5px] ring-brand-600">
        <Thumb file={file} page={fact.evidencePages[0]} />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="text-[16px] font-medium leading-tight">{i18n._(FACT_SHORT[fact.id][fact.value]!)}</span>
          <span className="rounded-[5px] bg-brand-600 px-1.5 py-px text-[11px] font-medium text-primary-foreground">
            <Trans>Recommended</Trans>
          </span>
          <span className="text-[13px] leading-snug text-muted-foreground">{i18n._(FACT_HINT[fact.id]![fact.value]!)}</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" data-q-first="" onClick={() => onAnswer(fact.value)} className="lc-btn h-10 px-4 text-[14.5px]">
          <Check className="size-4 stroke-[2.5]" />
          <Trans>Use this</Trans>
        </button>
        <button type="button" onClick={onOthers} className="rounded-full px-2 py-1 text-[13px] text-muted-foreground underline decoration-current/40 underline-offset-[3px] transition-colors hover:text-foreground">
          <Trans>Other options</Trans>
        </button>
      </div>
    </div>
  )
}
