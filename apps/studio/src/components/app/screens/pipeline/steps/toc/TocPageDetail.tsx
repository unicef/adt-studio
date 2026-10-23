import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { TocEntry } from "@/api/client"
import { PageDetailFrame } from "../shared/page-detail/PageDetailFrame"
import { TocEntryRow, type TocRowContext } from "./TocEntryRow"

export function TocPageDetail({
  label,
  pageId,
  pageNumber,
  entries,
  ctx,
  prevPageId,
  nextPageId,
  onStep,
  onClose,
}: {
  label: string
  pageId: string
  pageNumber: number
  entries: TocEntry[]
  ctx: TocRowContext
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
}) {
  const { t } = useLingui()
  return (
    <PageDetailFrame
      label={label}
      pageId={pageId}
      pageNumber={pageNumber}
      meta={t`${plural(entries.length, { one: "# entry links here", other: "# entries link here" })}`}
      prevPageId={prevPageId}
      nextPageId={nextPageId}
      onStep={onStep}
      onClose={onClose}
      state={entries.length === 0 ? "empty" : "ready"}
      emptyMessage={t`No entries link to this page.`}
    >
      <div className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <TocEntryRow key={entry.id} entry={entry} ctx={ctx} />
        ))}
      </div>
    </PageDetailFrame>
  )
}
