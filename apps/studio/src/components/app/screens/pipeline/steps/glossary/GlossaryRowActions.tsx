import { Hand, Image as ImageIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { TermOccurrence } from "@/components/pipeline/stages/glossary/lib/occurrences"
import { OccurrenceSummary, type OccurrencePage } from "./TermOccurrences"
import { TermStateButton } from "./TermStateButton"
import { VariationsMark } from "./VariationsMark"
import type { GlossaryRow } from "./glossaryRows"

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
  return (
    <>
      <VariationsMark variations={row.variations} />
      <OccurrenceSummary occurrence={occurrence} pages={occurrencePages} loading={occurrencesLoading} onOpenPage={onOpenPage} />
      <span className="flex w-10 items-center justify-end gap-1 text-muted-foreground">
        {row.imageId && <ImageIcon role="img" aria-label={t`Has a picture`} className="size-3.5" />}
        {hasVideo && <Hand role="img" aria-label={t`Has a sign-language video`} className="size-3.5" />}
      </span>
      <TermStateButton row={row} locked={locked} onPrune={onPrune} onRemove={onRemove} />
    </>
  )
}
