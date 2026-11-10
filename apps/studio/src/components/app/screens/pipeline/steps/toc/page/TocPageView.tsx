import { useCallback, useMemo } from "react"
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { PageDetail, PageSummaryItem, TocEntry } from "@/api/client"
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
import { useInspectorSheet } from "../../shared/page-inspector/useInspectorSheet"
import { READING_TEXT, TextSection } from "../../extract/page-detail/sections/TextSection"
import { noTextLine } from "../../extract/page-detail/emptyCopy"
import { TocEntryRow, type TocRowContext } from "../TocEntryRow"
import { TocEntriesSection, TocEntriesTitle } from "./TocEntriesSection"
import { TocPlaceholderPanel } from "./TocPlaceholderPanel"
import { useTocPageData, type TocPageData } from "./useTocPageData"

type SheetKind = "entries" | "text"

const NO_BOXES: never[] = []
const noop = () => {}

export interface TocPageViewProps {
  label: string
  pageId: string
  pageNumber: number
  hex: string
  entries: readonly TocEntry[]
  ctx: TocRowContext
  saveError: Error | null
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
  problem?: DescribedProblem | null
  retry?: ProblemRetry
}

export function TocPageView(props: TocPageViewProps) {
  const { label, pageId, pageNumber, hex, entries, prevPageId, nextPageId, onStep, onClose } = props
  const { t } = useLingui()
  const data = useTocPageData(label, pageId, prevPageId, nextPageId)
  const pageProblem = usePageProblem({ label, problem: props.problem ?? null, pageId, pageNumber, retry: props.retry })
  const { page, query } = data
  const infoLine = t`${pageId} · ${plural(entries.length, { one: "# entry links here", other: "# entries link here" })}`
  const info = useCallback(() => infoLine, [infoLine])
  const panel = useCallback((summary: PageSummaryItem | null) => <TocPlaceholderPanel summary={summary} entries={entries} hex={hex} />, [entries, hex])

  return (
    <StepBody
      title={<Trans>Page {page?.pageNumber ?? pageNumber}</Trans>}
      width="fluid"
      fill
      titleExtra={pageProblem ? <PageProblemChip problem={pageProblem} hex={hex} stageName={getStageLabelI18n("toc")} onAllPages={onClose} /> : undefined}
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
        <PageDetailLoading label={label} pageId={pageId} pageNumber={pageNumber} ready={!!page} pageSrc={data.pageSrc} panel={panel} info={info}>
          {page ? <TocInspector {...props} page={page} data={data} infoLine={infoLine} /> : null}
        </PageDetailLoading>
      )}
    </StepBody>
  )
}

function TocInspector({ hex, entries, ctx, saveError, page, data, infoLine }: TocPageViewProps & { page: PageDetail; data: TocPageData; infoLine: string }) {
  const sheet = useInspectorSheet<SheetKind>("entries")
  const sheetCtx = useMemo<TocRowContext>(() => ({ ...ctx, onAddAfter: undefined, onOpenPage: undefined }), [ctx])

  return (
    <>
      <InspectorInfoLine>{infoLine}</InspectorInfoLine>
      {refreshFailed(data.query) && <PageRefreshFailed pageNumber={page.pageNumber} hex={hex} onRetry={() => void data.query.refetch()} />}

      <InspectorLayout
        page={
          <PagePreview
            src={data.pageSrc}
            lowSrc={data.lowSrc}
            pageNumber={page.pageNumber}
            size={data.pageSize}
            entries={NO_BOXES}
            hoverId={null}
            selectedId={null}
            onHover={noop}
            onSelect={noop}
          />
        }
        sheet={
          <PageDetailSheet
            open={sheet.open}
            contentKey={sheet.shownKind}
            title={sheet.shownKind === "entries" ? <TocEntriesTitle count={entries.length} /> : <Trans>Text</Trans>}
            pageSrc={data.pageSrc}
            pageNumber={page.pageNumber}
            onClose={sheet.close}
          >
            {sheet.shownKind === "entries" ? (
              <div className="flex flex-col gap-1.5">
                {entries.map((entry) => (
                  <TocEntryRow key={entry.id} entry={entry} ctx={sheetCtx} />
                ))}
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
            <TocEntriesSection entries={entries} ctx={sheetCtx} saveError={saveError} more={sheet.more("entries")} />
            <TextSection page={page} metadataRunning={false} more={sheet.more("text")} />
          </>
        }
      />
    </>
  )
}
