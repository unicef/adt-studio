import { useEffect, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ExternalLink, HelpCircle } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { useStepHeader } from "../../../components/StepViewRouter"
import { StorySectionBanner } from "./StorySectionBanner"
import { useQuizzes } from "@/hooks/use-quizzes"
import { usePageImage, usePages } from "@/hooks/use-pages"
import { BASE_URL } from "@/api/client"
import { resolveQuizId, type Quiz } from "@adt/types"

/**
 * Quiz panel rendered inside the storyboard stage when a quiz row is selected.
 * Fills the full content area and shows the *real* rendered quiz template — the
 * same HTML the runtime/output uses — by loading the adt-preview quiz page
 * (renderQuizHtml + the ADT bundle) in an iframe, exactly how activity sections
 * preview. This keeps the storyboard WYSIWYG instead of maintaining a separate
 * React mock-up that drifts from the template. Editing happens on the dedicated
 * Quizzes stage.
 */
export function StoryboardQuizDetail({
  bookLabel,
  quizId,
  navigationExtra,
  navigationArrows,
}: {
  bookLabel: string
  /** Stable quiz id (`qz001`) — also the adt-preview filename stem. */
  quizId: string
  navigationExtra?: ReactNode
  navigationArrows?: ReactNode
}) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const { setExtra, setOnLabelClick } = useStepHeader()
  const { data: quizzesData, isLoading } = useQuizzes(bookLabel)
  const { data: pages } = usePages(bookLabel)

  const quiz: Quiz | undefined = quizzesData?.quizzes?.quizzes?.find(
    (q, i) => resolveQuizId(q, i) === quizId,
  )

  const afterPage = pages?.find((p) => p.pageId === quiz?.afterPageId)

  const openQuizzesStage = () =>
    navigate({
      to: "/books/$label/$step",
      params: { label: bookLabel, step: "quizzes" },
    })

  // Header: "Storyboard / Quiz / after page X"
  useEffect(() => {
    setOnLabelClick(null)
    setExtra(
      <>
        {navigationExtra}
        <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded bg-orange-300/30 ring-1 ring-white/20 text-white text-[10px] font-semibold uppercase tracking-wide">
          <HelpCircle className="h-3 w-3" />
          {t`Quiz`}
        </span>
        {afterPage && (
          <span className="text-white/60 text-[11px]">
            {t`after page ${afterPage.pageNumber}`}
          </span>
        )}
        <div className="flex-1" />
        {navigationArrows}
      </>,
    )
    return () => {
      setExtra(null)
      setOnLabelClick(null)
    }
  }, [setExtra, setOnLabelClick, navigationExtra, navigationArrows, afterPage?.pageNumber, t])

  if (isLoading && !quiz) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        <Trans>Loading quiz...</Trans>
      </div>
    )
  }

  if (!quiz) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md text-center text-sm text-muted-foreground">
          <Trans>Quiz not found. It may have been removed since you opened the storyboard.</Trans>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
      {/* Header — banner + the source pages used to generate the quiz */}
      <div className="shrink-0 px-6 pt-6">
        <StorySectionBanner
          icon={<HelpCircle className="w-4 h-4" />}
          title={t`Quiz`}
          subtitle={
            afterPage
              ? t`Knowledge check generated from the source pages, after page ${afterPage.pageNumber}.`
              : t`Knowledge check generated from the source pages.`
          }
          action={
            <button
              type="button"
              onClick={openQuizzesStage}
              className="flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors text-xs font-medium cursor-pointer"
              title={t`Open the Quizzes stage to edit this quiz`}
            >
              <ExternalLink className="h-3 w-3" />
              {t`Edit in Quizzes`}
            </button>
          }
        />
        {quiz.pageIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pb-4">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              <Trans>Drawn from</Trans>
            </span>
            {quiz.pageIds.map((pid) => (
              <QuizPageChip key={pid} bookLabel={bookLabel} pageId={pid} pages={pages} />
            ))}
          </div>
        )}
      </div>

      {/* Real rendered quiz — the same template the runtime/output uses, served
          on-demand by the adt-preview route (renderQuizHtml + ADT bundle) so the
          storyboard shows the true quiz, not a separate React mock-up. */}
      <div className="flex-1 min-h-0 pb-6 px-6">
        <iframe
          title={t`Quiz preview`}
          src={`${BASE_URL}/books/${bookLabel}/adt-preview/${quizId}.html?embed=1&v=${quizzesData?.version ?? 0}`}
          className="w-full h-full rounded border bg-white"
        />
      </div>
    </div>
  )
}

function QuizPageChip({
  bookLabel,
  pageId,
  pages,
}: {
  bookLabel: string
  pageId: string
  pages: ReturnType<typeof usePages>["data"]
}) {
  const { data } = usePageImage(bookLabel, pageId)
  const page = pages?.find((p) => p.pageId === pageId)
  const src = data?.imageBase64 ? `data:image/png;base64,${data.imageBase64}` : null
  return (
    <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-background ring-1 ring-border">
      <div className="w-6 h-8 rounded-sm bg-muted overflow-hidden ring-1 ring-border">
        {src && <img src={src} alt="" className="w-full h-full object-cover" />}
      </div>
      <span className="text-[10px] font-mono text-muted-foreground">
        {page ? `pg ${page.pageNumber}` : pageId}
      </span>
    </div>
  )
}
