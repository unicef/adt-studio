import { memo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { SignLanguageVideo } from "@/api/client"
import type { TermOccurrence } from "@/components/pipeline/stages/glossary/lib/occurrences"
import { ExpandableRow } from "../shared/list/ExpandableRow"
import { GlossaryEditor } from "./GlossaryEditor"
import { GlossaryRowActions } from "./GlossaryRowActions"
import { GlossaryRowSummary } from "./GlossaryRowSummary"
import type { OccurrencePage } from "./TermOccurrences"
import type { GlossaryRow, GlossaryTextPatch } from "./glossaryRows"

export interface GlossaryRowContext {
  label: string
  hex: string
  locked: boolean
  videoBlockedReason?: string
  videos: SignLanguageVideo[]
  occurrencesLoading: boolean
  occurrenceOf: (row: GlossaryRow) => TermOccurrence | undefined
  pagesOf: (row: GlossaryRow) => OccurrencePage[]
  textIdOf: (row: GlossaryRow) => string
  videoOf: (row: GlossaryRow) => SignLanguageVideo | null
  isEdited: (row: GlossaryRow) => boolean
  onOpenPage: (pageId: string) => void
  onText: (key: string, patch: GlossaryTextPatch) => void
  onPicture: (key: string, imageId: string | undefined) => void
  onPrune: (key: string, pruned: boolean) => void
  onRemove: (key: string) => void
}

export const GlossaryTermRow = memo(function GlossaryTermRow({
  row,
  ctx,
  expanded,
  onToggle,
  flash,
}: {
  row: GlossaryRow
  ctx: GlossaryRowContext
  expanded: boolean
  onToggle?: () => void
  flash: boolean
}) {
  const { t } = useLingui()
  const occurrence = ctx.occurrenceOf(row)
  const pages = ctx.pagesOf(row)
  const video = ctx.videoOf(row)
  return (
    <ExpandableRow
      id={row._key}
      accent={ctx.hex}
      expanded={expanded}
      onToggle={onToggle}
      muted={row.pruned === true}
      mutedLabel={t`Pruned: left out of the book`}
      edited={ctx.isEdited(row)}
      flash={flash}
      summary={<GlossaryRowSummary row={row} hex={ctx.hex} />}
      actions={
        <GlossaryRowActions
          row={row}
          occurrence={occurrence}
          occurrencePages={pages}
          occurrencesLoading={ctx.occurrencesLoading}
          hasVideo={!!video}
          locked={ctx.locked}
          onOpenPage={ctx.onOpenPage}
          onPrune={(pruned) => ctx.onPrune(row._key, pruned)}
          onRemove={() => ctx.onRemove(row._key)}
        />
      }
    >
      <GlossaryEditor
        label={ctx.label}
        row={row}
        textId={ctx.textIdOf(row)}
        video={video}
        videos={ctx.videos}
        occurrence={occurrence}
        occurrencePages={pages}
        locked={ctx.locked}
        videoBlockedReason={ctx.videoBlockedReason}
        onText={(patch) => ctx.onText(row._key, patch)}
        onPicture={(imageId) => ctx.onPicture(row._key, imageId)}
        onOpenPage={ctx.onOpenPage}
      />
    </ExpandableRow>
  )
})
