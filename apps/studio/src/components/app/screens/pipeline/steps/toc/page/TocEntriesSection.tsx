import { Trans } from "@lingui/react/macro"
import { ListTree } from "lucide-react"
import type { TocEntry } from "@/api/client"
import { PageSection } from "../../shared/page-inspector/PageSection"
import { SeeMoreButton } from "../../shared/page-inspector/SeeMoreButton"
import type { SectionMore } from "../../shared/page-inspector/useInspectorSheet"
import { SaveError } from "../../shared/ui"
import type { TocRowContext } from "../TocEntryRow"
import { TocCompactEntry } from "./TocCompactEntry"

export const TOC_ENTRY_PREVIEW = 4

export function TocEntriesTitle({ count }: { count: number }) {
  return <Trans>Entries · {count}</Trans>
}

export function TocEntriesSection({
  entries,
  ctx,
  saveError,
  more,
}: {
  entries: readonly TocEntry[]
  ctx: TocRowContext
  saveError: Error | null
  more: SectionMore
}) {
  if (entries.length === 0)
    return <PageSection icon={ListTree} title={<Trans>Entries</Trans>} empty={<Trans>No entries link to this page.</Trans>} />

  const preview = entries.slice(0, TOC_ENTRY_PREVIEW)
  const hidden = entries.length - preview.length

  return (
    <PageSection icon={ListTree} title={<TocEntriesTitle count={entries.length} />}>
      <SaveError error={saveError} />
      <div className="flex flex-col gap-2">
        {preview.map((entry) => (
          <TocCompactEntry key={entry.id} entry={entry} ctx={ctx} />
        ))}
      </div>
      {hidden > 0 && <SeeMoreButton count={hidden} open={more.open} onClick={more.onMore} buttonRef={more.buttonRef} />}
    </PageSection>
  )
}
