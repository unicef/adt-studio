import type { ReactNode } from "react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { HelpCircle, Plus } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { ListToolbar } from "../shared/list/ListToolbar"
import { useListView } from "../shared/list/useListView"
import { ListPagesGrid } from "../shared/list/variants/ListPagesGrid"
import { ListPagesSwitch } from "../shared/list/variants/ListPagesSwitch"
import { StepActionButton } from "../shared/StepActionButton"
import { StepSearch } from "../shared/StepSearch"
import { SaveError, StepBody, StepEmptyHint } from "../shared/ui"
import { QuizRowItem, type QuizRowContext } from "./QuizRowItem"
import type { QuizRow } from "./quizRows"

export function QuizzesOverview({
  label,
  hex,
  meta,
  top,
  help,
  quizzes,
  shown,
  positionOf,
  search,
  onSearch,
  saveError,
  ctx,
  expanded,
  onToggle,
  addDisabledReason,
  onAdd,
  navPages,
  aspect,
  quizzesOn,
  onOpenPage,
  showRows,
  onShowRows,
}: {
  label: string
  hex: string
  meta: string
  top: ReactNode
  help: ReactNode
  quizzes: QuizRow[]
  shown: QuizRow[]
  positionOf: (quiz: QuizRow) => number
  search: string
  onSearch: (value: string) => void
  saveError: Error | null
  ctx: QuizRowContext
  expanded: ReadonlySet<string>
  onToggle: (key: string) => void
  addDisabledReason?: string
  onAdd: () => void
  navPages: readonly PipelinePage[]
  aspect: PageAspect
  quizzesOn: (pageId: string) => QuizRow[]
  onOpenPage: (pageId: string) => void
  showRows: boolean
  onShowRows: () => void
}) {
  const { t } = useLingui()
  const view = useListView("quizzes")
  const byPage = view === "pages" && !showRows
  const searching = search.trim().length > 0
  return (
    <StepBody
      width="reading"
      title={getStageLabelI18n("quizzes")}
      meta={meta}
      titleExtra={help}
      actions={
        <>
          {!byPage && (
            <StepSearch
              value={search}
              onChange={onSearch}
              placeholder={t`Search questions and answers…`}
              ariaLabel={t`Search questions and answers`}
              matches={{ shown: shown.length, total: quizzes.length }}
            />
          )}
          <StepActionButton icon={Plus} accent={hex} onClick={onAdd} disabled={!!addDisabledReason} disabledReason={addDisabledReason}>
            <Trans>Add quiz</Trans>
          </StepActionButton>
        </>
      }
    >
      {top}
      {byPage && <ListToolbar right={<ListPagesSwitch label={t`All questions`} onClick={onShowRows} />} />}
      <SaveError error={saveError} />
      {byPage ? (
        <ListPagesGrid
          label={label}
          pages={navPages}
          aspect={aspect}
          onOpen={onOpenPage}
          cardOf={(page) => {
            const list = quizzesOn(page.pageId)
            return {
              stats: [{ key: "q", icon: HelpCircle, value: list.length, label: t`${plural(list.length, { one: "# question", other: "# questions" })}` }],
              preview: list[0]?.question,
            }
          }}
        />
      ) : shown.length === 0 ? (
        <StepEmptyHint>
          <span className="flex flex-col items-center gap-2">
            {searching ? <Trans>No questions match “{search.trim()}”</Trans> : <Trans>No questions yet</Trans>}
            {searching && (
              <button type="button" onClick={() => onSearch("")} className="font-medium text-foreground underline-offset-4 hover:underline">
                <Trans>Clear search</Trans>
              </button>
            )}
          </span>
        </StepEmptyHint>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shown.map((quiz) => (
            <QuizRowItem
              key={quiz.quizId}
              quiz={quiz}
              position={positionOf(quiz)}
              ctx={ctx}
              expanded={view === "cards" || expanded.has(quiz.quizId)}
              onToggle={view === "cards" ? undefined : () => onToggle(quiz.quizId)}
            />
          ))}
        </div>
      )}
    </StepBody>
  )
}
