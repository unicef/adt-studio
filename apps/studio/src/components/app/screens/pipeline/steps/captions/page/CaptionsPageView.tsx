import { useCallback, useState } from "react"
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { PageDetail, PageSummaryItem } from "@/api/client"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import { DetailNavButton, StepBody } from "../../shared/ui"
import { PageLoadError, PageRefreshFailed } from "../../shared/page-detail/PageNotices"
import { refreshFailed } from "../../shared/page-detail/pageDetailState"
import type { DescribedProblem } from "../../shared/problems/useDescribeProblem"
import type { ProblemRetry } from "../../shared/problems/FoldedProblem"
import { InspectorInfoLine, InspectorLayout } from "../../shared/page-inspector/layout"
import { PageDetailLoading } from "../../shared/page-inspector/loading/PageDetailLoading"
import { PageDetailSheet } from "../../shared/page-inspector/PageDetailSheet"
import { PagePreview } from "../../shared/page-inspector/PagePreview"
import { PageProblemChip } from "../../shared/page-inspector/problem/PageProblemChip"
import { usePageProblem } from "../../shared/page-inspector/problem/usePageProblem"
import { useBoxSelection } from "../../shared/page-inspector/useBoxSelection"
import { useInspectorSheet } from "../../shared/page-inspector/useInspectorSheet"
import { READING_TEXT, TextSection } from "../../extract/page-detail/sections/TextSection"
import { noTextLine } from "../../extract/page-detail/emptyCopy"
import { CaptionCards } from "../CaptionCards"
import { CaptionFilterBar, CaptionFilterEmpty } from "../CaptionFilterBar"
import { CaptionLightbox } from "../CaptionLightbox"
import { CaptionsVersionPicker } from "../CaptionsVersionPicker"
import { useCaptionFilters, type ItemFilter } from "../useCaptionFilters"
import { CaptionImagesSection } from "./CaptionImagesSection"
import { CaptionsPlaceholderPanel } from "./CaptionsPlaceholderPanel"
import { ImagesTitle } from "./ImagesTitle"
import { useCaptionsPageData, type CaptionsPageData } from "./useCaptionsPageData"

type SheetKind = "images" | "text"

const PICKER_TRIGGER = cn("h-6 gap-1 rounded-md border bg-card px-1.5 text-[11.5px]! font-semibold! text-foreground hover:bg-muted")

const renderPlaceholderPanel = (summary: PageSummaryItem | null) => <CaptionsPlaceholderPanel summary={summary} />

export interface CaptionsPageViewProps {
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
  problem?: DescribedProblem | null
  retry?: ProblemRetry
}

export function CaptionsPageView(props: CaptionsPageViewProps) {
  const { label, pageId, pageNumber, hex, prevPageId, nextPageId, onStep, onClose } = props
  const { t } = useLingui()
  const data = useCaptionsPageData(label, pageId, prevPageId, nextPageId, props.locked, hex)
  const pageProblem = usePageProblem({ label, problem: props.problem ?? null, pageId, pageNumber, retry: props.retry })
  const { page, query } = data
  const info = useCallback(
    (summary: PageSummaryItem) => t`${pageId} · ${plural(summary.captionCount ?? 0, { one: "# image on this page", other: "# images on this page" })}`,
    [t, pageId],
  )

  return (
    <StepBody
      title={<Trans>Page {page?.pageNumber ?? pageNumber}</Trans>}
      width="fluid"
      fill
      titleExtra={pageProblem ? <PageProblemChip problem={pageProblem} hex={hex} stageName={getStageLabelI18n("captions")} onAllPages={onClose} /> : undefined}
      actions={
        <>
          <DetailNavButton icon={ChevronLeft} label={t`Previous page`} onClick={() => prevPageId && onStep(prevPageId)} disabled={!prevPageId} />
          <DetailNavButton icon={ChevronRight} label={t`Next page`} onClick={() => nextPageId && onStep(nextPageId)} disabled={!nextPageId} />
          <DetailNavButton icon={LayoutGrid} label={t`All pages`} onClick={onClose}>
            <Trans>All pages</Trans>
          </DetailNavButton>
        </>
      }
    >
      {query.isError && !page ? (
        <PageLoadError pageNumber={pageNumber} onRetry={() => void query.refetch()} />
      ) : (
        <PageDetailLoading
          label={label}
          pageId={pageId}
          pageNumber={pageNumber}
          ready={!!page}
          pageSrc={data.pageSrc}
          panel={renderPlaceholderPanel}
          info={info}
        >
          {page ? <CaptionsInspector {...props} page={page} data={data} /> : null}
        </PageDetailLoading>
      )}
    </StepBody>
  )
}

function CaptionsInspector({
  label,
  pageId,
  hex,
  locked,
  initialFilter,
  query,
  page,
  data,
}: CaptionsPageViewProps & { page: PageDetail; data: CaptionsPageData }) {
  const { t } = useLingui()
  const { edits } = data
  const filters = useCaptionFilters({ page, edits, initialFilter, query })
  const selection = useBoxSelection()
  const sheet = useInspectorSheet<SheetKind>("images")
  const [lightbox, setLightbox] = useState<number | null>(null)
  const open = useCallback(
    (imageId: string) => setLightbox(Math.max(0, filters.shown.items.findIndex((entry) => entry.imageId === imageId))),
    [filters.shown.items],
  )
  const count = edits.items.length
  const version = page.versions.imageCaptioning

  const versionPicker = page.imageCaptioning ? (
    <CaptionsVersionPicker
      label={label}
      pageId={pageId}
      currentVersion={version}
      saving={edits.saving}
      dirty={edits.dirty}
      onRestored={edits.discard}
      triggerClassName={PICKER_TRIGGER}
      triggerLabel={version != null ? t`Description version ${version}. Change version` : undefined}
    />
  ) : null

  return (
    <>
      <InspectorInfoLine>{t`${pageId} · ${plural(count, { one: "# image on this page", other: "# images on this page" })}`}</InspectorInfoLine>
      {refreshFailed(data.query) && <PageRefreshFailed pageNumber={page.pageNumber} hex={hex} onRetry={() => void data.query.refetch()} />}

      <InspectorLayout
        page={
          <PagePreview
            src={data.pageSrc}
            lowSrc={data.lowSrc}
            pageNumber={page.pageNumber}
            size={data.pageSize}
            entries={data.boxes}
            hoverId={selection.hoverId}
            selectedId={selection.selectedId}
            onHover={selection.hover}
            onSelect={selection.select}
          />
        }
        sheet={
          <PageDetailSheet
            open={sheet.open}
            contentKey={sheet.shownKind}
            title={sheet.shownKind === "images" ? <ImagesTitle filters={filters} /> : <Trans>Text</Trans>}
            pageSrc={data.pageSrc}
            pageNumber={page.pageNumber}
            onClose={sheet.close}
          >
            {sheet.shownKind === "images" ? (
              <div className="flex flex-col gap-4">
                <CaptionFilterBar filters={filters} hex={hex} />
                {filters.shown.items.length === 0 ? (
                  <CaptionFilterEmpty filters={filters} />
                ) : (
                  <CaptionCards label={label} hex={hex} edits={edits} filters={filters} locked={locked} onOpen={open} />
                )}
              </div>
            ) : page.text ? (
              <p className={cn(READING_TEXT, "mx-auto text-[15px] leading-[1.7]")}>{page.text.trim()}</p>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">{noTextLine(page)}</p>
            )}
          </PageDetailSheet>
        }
        panel={
          <>
            <CaptionImagesSection
              label={label}
              hex={hex}
              edits={edits}
              filters={filters}
              numberOf={data.numberOf}
              selection={selection}
              locked={locked}
              versionPicker={versionPicker}
              more={sheet.more("images")}
              onOpen={open}
            />
            <TextSection page={page} metadataRunning={false} more={sheet.more("text")} />
          </>
        }
      />

      {lightbox !== null && (
        <CaptionLightbox
          label={label}
          page={page}
          items={filters.shown.items}
          index={lightbox}
          edits={edits}
          locked={locked}
          hex={hex}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
        />
      )}
    </>
  )
}
