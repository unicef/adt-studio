import { useCallback, useMemo, useState } from "react"
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
import { READING_TEXT } from "../../extract/page-detail/sections/TextSection"
import type { GlossaryRowContext } from "../GlossaryTermRow"
import type { GlossaryRow } from "../glossaryRows"
import { GlossaryPageText } from "./GlossaryPageText"
import { GlossaryPlaceholderPanel } from "./GlossaryPlaceholderPanel"
import { GlossarySheetTerms } from "./GlossarySheetTerms"
import { GlossaryTermsSection } from "./GlossaryTermsSection"
import { HighlightedText } from "./HighlightedText"
import { splitByTerms } from "./termMatches"
import { useGlossaryPageData, type GlossaryPageData } from "./useGlossaryPageData"

type SheetKind = "terms" | "text"

const NO_PAGE_BOXES: never[] = []

export interface GlossaryPageViewProps {
  label: string
  pageId: string
  pageNumber: number
  rows: GlossaryRow[]
  ctx: GlossaryRowContext
  saveError: Error | null
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
  problem?: DescribedProblem | null
  retry?: ProblemRetry
}

export function GlossaryPageView(props: GlossaryPageViewProps) {
  const { label, pageId, pageNumber, rows, ctx, prevPageId, nextPageId, onStep, onClose } = props
  const { t } = useLingui()
  const data = useGlossaryPageData(label, pageId, prevPageId, nextPageId)
  const pageProblem = usePageProblem({ label, problem: props.problem ?? null, pageId, pageNumber, retry: props.retry })
  const { page, query } = data
  const placeholder = useCallback((summary: PageSummaryItem | null) => <GlossaryPlaceholderPanel rows={rows} hex={ctx.hex} summary={summary} />, [rows, ctx.hex])
  const info = useCallback(() => pageId, [pageId])

  return (
    <StepBody
      title={<Trans>Page {page?.pageNumber ?? pageNumber}</Trans>}
      meta={t`${plural(rows.length, { one: "# term on this page", other: "# terms on this page" })}`}
      width="fluid"
      fill
      titleExtra={pageProblem ? <PageProblemChip problem={pageProblem} hex={ctx.hex} stageName={getStageLabelI18n("glossary")} onAllPages={onClose} /> : undefined}
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
        <PageDetailLoading label={label} pageId={pageId} pageNumber={pageNumber} ready={!!page} pageSrc={data.pageSrc} panel={placeholder} info={info}>
          {page ? <GlossaryInspector {...props} page={page} data={data} /> : null}
        </PageDetailLoading>
      )}
    </StepBody>
  )
}

function GlossaryInspector({ pageId, rows, ctx, saveError, page, data }: GlossaryPageViewProps & { page: PageDetail; data: GlossaryPageData }) {
  const selection = useBoxSelection()
  const sheet = useInspectorSheet<SheetKind>("terms")
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const text = page.text?.trim() ?? ""
  const hits = useMemo(() => {
    const counts = new Map<string, number>()
    for (const segment of splitByTerms(text, rows)) if (segment.key) counts.set(segment.key, (counts.get(segment.key) ?? 0) + 1)
    return counts
  }, [text, rows])
  const activeKey = selection.hoverId ?? selection.selectedId
  const edit = useCallback(
    (key: string) => {
      setFocusKey(key)
      sheet.show("terms")
    },
    [sheet],
  )
  const termsMore = sheet.more("terms")
  const openTerms = () => {
    setFocusKey(null)
    termsMore.onMore()
  }

  return (
    <>
      <InspectorInfoLine>{pageId}</InspectorInfoLine>
      {refreshFailed(data.query) && <PageRefreshFailed pageNumber={page.pageNumber} hex={ctx.hex} onRetry={() => void data.query.refetch()} />}

      <InspectorLayout
        page={
          <PagePreview
            src={data.pageSrc}
            lowSrc={data.lowSrc}
            pageNumber={page.pageNumber}
            size={data.pageSize}
            entries={NO_PAGE_BOXES}
            hoverId={null}
            selectedId={null}
            onHover={selection.hover}
            onSelect={selection.select}
          />
        }
        sheet={
          <PageDetailSheet
            open={sheet.open}
            contentKey={sheet.shownKind}
            title={sheet.shownKind === "terms" ? <Trans>Terms · {rows.length}</Trans> : <Trans>Text</Trans>}
            pageSrc={data.pageSrc}
            pageNumber={page.pageNumber}
            onClose={sheet.close}
          >
            {sheet.shownKind === "terms" ? (
              <GlossarySheetTerms rows={rows} ctx={ctx} focusKey={focusKey} />
            ) : (
              <HighlightedText
                text={text}
                rows={rows}
                activeKey={activeKey}
                onHover={selection.hover}
                onSelect={edit}
                className={cn(READING_TEXT, "mx-auto text-[15px] leading-[1.7]")}
              />
            )}
          </PageDetailSheet>
        }
        panel={
          <>
            <GlossaryTermsSection
              rows={rows}
              ctx={ctx}
              hits={hits}
              selection={selection}
              saveError={saveError}
              more={{ ...termsMore, onMore: openTerms }}
              onEdit={edit}
            />
            <GlossaryPageText page={page} rows={rows} activeKey={activeKey} onHover={selection.hover} onSelect={selection.select} more={sheet.more("text")} />
          </>
        }
      />
    </>
  )
}
