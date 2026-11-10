import { Trans } from "@lingui/react/macro"
import { BookOpen } from "lucide-react"
import { PageSection } from "../../shared/page-inspector/PageSection"
import { SeeMoreButton } from "../../shared/page-inspector/SeeMoreButton"
import type { BoxSelection } from "../../shared/page-inspector/useBoxSelection"
import type { SectionMore } from "../../shared/page-inspector/useInspectorSheet"
import { SaveError } from "../../shared/ui"
import type { GlossaryRowContext } from "../GlossaryTermRow"
import type { GlossaryRow } from "../glossaryRows"
import { GlossaryCompactTerm } from "./GlossaryCompactTerm"

export const TERM_PREVIEW = 5

export function GlossaryTermsSection({
  rows,
  ctx,
  hits,
  selection,
  saveError,
  more,
  onEdit,
}: {
  rows: GlossaryRow[]
  ctx: GlossaryRowContext
  hits: ReadonlyMap<string, number>
  selection: BoxSelection
  saveError: Error | null
  more: SectionMore
  onEdit: (key: string) => void
}) {
  if (rows.length === 0)
    return <PageSection icon={BookOpen} title={<Trans>Terms</Trans>} empty={<Trans>No glossary terms appear on this page.</Trans>} />

  const selectedIndex = rows.findIndex((row) => row._key === selection.selectedId)
  const preview = selectedIndex >= TERM_PREVIEW ? [...rows.slice(0, TERM_PREVIEW - 1), rows[selectedIndex]] : rows.slice(0, TERM_PREVIEW)
  const hidden = rows.length - preview.length

  return (
    <PageSection icon={BookOpen} title={<Trans>Terms · {rows.length}</Trans>}>
      <SaveError error={saveError} />
      <div className="flex flex-col gap-2">
        {preview.map((row) => (
          <GlossaryCompactTerm
            key={row._key}
            row={row}
            hex={ctx.hex}
            hits={hits.get(row._key) ?? 0}
            edited={ctx.isEdited(row)}
            locked={ctx.locked}
            active={row._key === selection.hoverId}
            selected={row._key === selection.selectedId}
            onHover={selection.hover}
            onText={ctx.onText}
            onPrune={ctx.onPrune}
            onRemove={ctx.onRemove}
            onEdit={onEdit}
          />
        ))}
      </div>
      <SeeMoreButton count={hidden > 0 ? hidden : undefined} open={more.open} onClick={more.onMore} buttonRef={more.buttonRef} />
    </PageSection>
  )
}
