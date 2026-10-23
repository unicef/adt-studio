import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { usePage } from "@/hooks/use-pages"
import { PageQueryDetail } from "../shared/page-detail/PageQueryDetail"
import { CaptionList, type ItemFilter } from "./CaptionList"
import { CaptionsVersionPicker } from "./CaptionsVersionPicker"
import { useCaptionEdits } from "./useCaptionEdits"

export function CaptionsPageDetail({
  label,
  pageId,
  pageNumber,
  hex,
  locked,
  initialFilter,
  query: search,
  prevPageId,
  nextPageId,
  onStep,
  onClose,
}: {
  label: string
  pageId: string
  pageNumber: number
  hex: string
  locked: boolean
  initialFilter: ItemFilter
  query: string
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
}) {
  const { t } = useLingui()
  const query = usePage(label, pageId)
  const page = query.data
  const edits = useCaptionEdits(label, pageId, page, locked)
  const count = page?.imageCaptioning?.captions.length ?? 0

  return (
    <PageQueryDetail
      label={label}
      pageId={pageId}
      pageNumber={pageNumber}
      prevPageId={prevPageId}
      nextPageId={nextPageId}
      onStep={onStep}
      onClose={onClose}
      query={query}
      empty={count === 0}
      emptyMessage={t`This page has no images to describe.`}
      meta={page ? t`${plural(count, { one: "# image on this page", other: "# images on this page" })}` : pageId}
      versionPicker={
        page?.imageCaptioning ? (
          <CaptionsVersionPicker
            label={label}
            pageId={pageId}
            currentVersion={page.versions.imageCaptioning}
            saving={edits.saving}
            dirty={edits.dirty}
            onRestored={edits.discard}
          />
        ) : null
      }
    >
      {page && <CaptionList label={label} page={page} hex={hex} edits={edits} locked={locked} initialFilter={initialFilter} query={search} />}
    </PageQueryDetail>
  )
}
