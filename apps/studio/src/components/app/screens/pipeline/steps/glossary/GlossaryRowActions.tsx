import { EyeOff, Hand, Image as ImageIcon, RotateCcw, Trash2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { TermOccurrence } from "@/components/pipeline/stages/glossary/lib/occurrences"
import { OccurrenceSummary, type OccurrencePage } from "./TermOccurrences"
import type { GlossaryRow } from "./glossaryRows"

const ACTION =
  "flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:text-muted-foreground"

export function GlossaryRowActions({
  row,
  occurrence,
  occurrencePages,
  occurrencesLoading,
  hasVideo,
  locked,
  onOpenPage,
  onPrune,
  onRemove,
}: {
  row: GlossaryRow
  occurrence: TermOccurrence | undefined
  occurrencePages: OccurrencePage[]
  occurrencesLoading: boolean
  hasVideo: boolean
  locked: boolean
  onOpenPage: (pageId: string) => void
  onPrune: (pruned: boolean) => void
  onRemove: () => void
}) {
  const { t } = useLingui()
  const pruned = row.pruned === true
  return (
    <>
      <OccurrenceSummary occurrence={occurrence} pages={occurrencePages} loading={occurrencesLoading} onOpenPage={onOpenPage} />
      <span className="flex w-10 items-center justify-end gap-1 text-muted-foreground">
        {row.imageId && <ImageIcon role="img" aria-label={t`Has a picture`} className="size-3.5" />}
        {hasVideo && <Hand role="img" aria-label={t`Has a sign-language video`} className="size-3.5" />}
      </span>
      {row.source === "manual" ? (
        <button type="button" disabled={locked} onClick={onRemove} aria-label={t`Remove ${row.word}`} className={`${ACTION} text-destructive hover:bg-destructive/10`}>
          <Trash2 className="size-3.5" />
        </button>
      ) : pruned ? (
        <button type="button" disabled={locked} onClick={() => onPrune(false)} className={`${ACTION} text-foreground hover:bg-muted`}>
          <RotateCcw className="size-3.5" />
          <Trans>Restore</Trans>
        </button>
      ) : (
        <button
          type="button"
          disabled={locked}
          onClick={() => onPrune(true)}
          aria-label={t`Prune ${row.word}`}
          className={`${ACTION} group/prune text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:text-foreground`}
        >
          <EyeOff className="size-3.5" />
          <span className="max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-200 group-hover/row:max-w-16 group-hover/row:opacity-100 group-focus-visible/prune:max-w-16 group-focus-visible/prune:opacity-100 motion-reduce:transition-none">
            <Trans>Prune</Trans>
          </span>
        </button>
      )}
    </>
  )
}
