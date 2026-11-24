import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import { Columns2, FileText, Info, ScanText } from "lucide-react"
import { PAGE_STORAGE, TEXT_LAYER_SHORT } from "../labels"
import { POP } from "../../../../core/ui"

function Chip({ children }: { children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[12px] font-semibold shadow-sm ring-1 ring-border ${POP}`}>{children}</span>
}

/**
 * Under the stage: what the engine measured, popping in as the preview builds (how the pages are
 * stored, then the text layer), and one light line on what the preview is.
 */
export function Found({ rec, step }: { rec: SetupRecommendation | null; step: number }) {
  const { i18n } = useLingui()
  const m = rec?.measured
  return (
    <div className="flex flex-col gap-2 px-3 pb-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex min-h-[26px] flex-wrap items-center gap-1.5">
        {m && step >= 1 && (
          <Chip>
            <Columns2 className="size-3.5 text-brand-600" />
            {i18n._(PAGE_STORAGE[m.pageStorage])}
          </Chip>
        )}
        {m && step >= 2 && (
          <Chip>
            {m.textLayer === "digital" ? <FileText className="size-3.5 text-brand-600" /> : <ScanText className="size-3.5 text-amber-600" />}
            {i18n._(TEXT_LAYER_SHORT[m.textLayer])}
          </Chip>
        )}
        {rec && !rec.secondOpinion && step >= 3 && (
          <Chip>
            <Info className="size-3.5 text-amber-600" />
            <Trans>Read once, not double-checked</Trans>
          </Chip>
        )}
      </div>
      <p className="text-[11.5px] leading-snug text-muted-foreground sm:text-right">
        <Trans>A sketch of where things go, not the converted book. Words are drawn as lines.</Trans>
      </p>
    </div>
  )
}
