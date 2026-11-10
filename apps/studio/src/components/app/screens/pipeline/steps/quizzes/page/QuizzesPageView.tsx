import { useCallback, useMemo } from "react"
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
import { useInspectorSheet } from "../../shared/page-inspector/useInspectorSheet"
import { READING_TEXT, TextSection } from "../../extract/page-detail/sections/TextSection"
import { noTextLine } from "../../extract/page-detail/emptyCopy"
import type { QuizRowContext } from "../QuizRowItem"
import type { PageQuiz } from "./pageQuizzes"
import { QuizQuestionsSection } from "./QuizQuestionsSection"
import { QuizSheetEditor } from "./QuizSheetEditor"
import { QuizzesPlaceholderPanel } from "./QuizzesPlaceholderPanel"
import { useQuizPageData, type QuizPageData } from "./useQuizPageData"

const TEXT_SHEET = "text"
const NO_BOXES: [] = []
const noop = () => {}

export interface QuizzesPageViewProps {
  label: string
  pageId: string
  pageNumber: number
  hex: string
  items: PageQuiz[]
  ctx: QuizRowContext
  saveError: Error | null
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
  problem?: DescribedProblem | null
  retry?: ProblemRetry
}

function useInfoLine(pageId: string, made: number) {
  const { t } = useLingui()
  return t`${pageId} · ${plural(made, { one: "# question made from this page", other: "# questions made from this page" })}`
}

export function QuizzesPageView(props: QuizzesPageViewProps) {
  const { label, pageId, pageNumber, hex, items, prevPageId, nextPageId, onStep, onClose } = props
  const { t } = useLingui()
  const data = useQuizPageData(label, pageId)
  const pageProblem = usePageProblem({ label, problem: props.problem ?? null, pageId, pageNumber, retry: props.retry })
  const { page, query } = data
  const infoLine = useInfoLine(pageId, items.filter((item) => item.madeFrom).length)
  const info = useCallback(() => infoLine, [infoLine])
  const questions = useMemo(() => items.filter((item) => !item.removed).map((item) => item.quiz.question), [items])
  const panel = useCallback((summary: PageSummaryItem | null) => <QuizzesPlaceholderPanel summary={summary} questions={questions} />, [questions])

  return (
    <StepBody
      title={<Trans>Page {page?.pageNumber ?? pageNumber}</Trans>}
      width="fluid"
      fill
      titleExtra={pageProblem ? <PageProblemChip problem={pageProblem} hex={hex} stageName={getStageLabelI18n("quizzes")} onAllPages={onClose} /> : undefined}
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
          {page ? <QuizzesInspector {...props} page={page} data={data} infoLine={infoLine} /> : null}
        </PageDetailLoading>
      )}
    </StepBody>
  )
}

function QuizzesInspector({
  hex,
  items,
  ctx,
  saveError,
  page,
  data,
  infoLine,
}: QuizzesPageViewProps & { page: PageDetail; data: QuizPageData; infoLine: string }) {
  const { t } = useLingui()
  const sheet = useInspectorSheet<string>(TEXT_SHEET)
  const sheetItem = items.find((item) => item.quiz.quizId === sheet.shownKind) ?? null

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
            title={sheetItem ? t`Question ${sheetItem.position}` : <Trans>Text</Trans>}
            pageSrc={data.pageSrc}
            pageNumber={page.pageNumber}
            onClose={sheet.close}
          >
            {sheetItem ? (
              <QuizSheetEditor item={sheetItem} ctx={ctx} onRemoved={sheet.close} />
            ) : page.text ? (
              <p className={cn(READING_TEXT, "mx-auto text-[15px] leading-[1.7]")}>{page.text.trim()}</p>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">{noTextLine(page)}</p>
            )}
          </PageDetailSheet>
        }
        panel={
          <>
            <QuizQuestionsSection items={items} ctx={ctx} saveError={saveError} moreFor={sheet.more} />
            <TextSection page={page} metadataRunning={false} more={sheet.more(TEXT_SHEET)} />
          </>
        }
      />
    </>
  )
}
