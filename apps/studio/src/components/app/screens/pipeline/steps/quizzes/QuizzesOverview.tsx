import { useRef, type ReactNode } from "react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { HelpCircle, Plus } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { cn } from "@/lib/utils"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { ListToolbar } from "../shared/list/ListToolbar"
import { NoMatches } from "../shared/list/NoMatches"
import { useListView } from "../shared/list/useListView"
import { useRowFlash } from "../shared/list/useRowFlash"
import { ListPagesGrid } from "../shared/list/variants/ListPagesGrid"
import { ListPagesSwitch } from "../shared/list/variants/ListPagesSwitch"
import { StepActionButton } from "../shared/StepActionButton"
import { StepSearch } from "../shared/StepSearch"
import { SaveError, StepBody, StepEmptyHint } from "../shared/ui"
import { QuizJumpMenu, type QuizJumpEntry } from "./QuizJumpMenu"
import { QuizList } from "./QuizList"
import type { QuizRowContext } from "./QuizRowItem"
import type { QuizRow } from "./quizRows"
import { useQuizInView } from "./useQuizInView"
import type { ListedQuiz } from "./useQuizList"

export function QuizzesOverview({
  label,
  hex,
  meta,
  top,
  help,
  total,
  shown,
  jumpEntries,
  search,
  onSearch,
  saveError,
  dirty,
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
  total: number
  shown: ListedQuiz[]
  jumpEntries: QuizJumpEntry[]
  search: string
  onSearch: (value: string) => void
  saveError: Error | null
  dirty: boolean
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
  const listRef = useRef<HTMLDivElement>(null)
  const { flashKey, reveal } = useRowFlash()
  const listKey = shown.map((row) => row.quiz.quizId).join(",")
  const inView = useQuizInView(listRef, !byPage && shown.length > 0, listKey)

  const jump = (key: string) => {
    if (!shown.some((row) => row.quiz.quizId === key)) onSearch("")
    reveal(key)
  }

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
              matches={{ shown: shown.length, total }}
            />
          )}
          <StepActionButton look="header" icon={Plus} onClick={onAdd} disabled={!!addDisabledReason} disabledReason={addDisabledReason}>
            <Trans>Add quiz</Trans>
          </StepActionButton>
        </>
      }
    >
      {top}
      {byPage ? (
        <ListToolbar right={<ListPagesSwitch label={t`All questions`} onClick={onShowRows} />} />
      ) : (
        total > 1 && (
          <ListToolbar
            right={
              <QuizJumpMenu
                entries={jumpEntries}
                currentKey={inView}
                hex={hex}
                onJump={jump}
              />
            }
          />
        )
      )}
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
        search.trim() ? (
          <NoMatches query={search} noun={t`questions`} onClear={() => onSearch("")} />
        ) : (
          <StepEmptyHint>
            <Trans>No questions yet</Trans>
          </StepEmptyHint>
        )
      ) : (
        <QuizList ref={listRef} rows={shown} ctx={ctx} cards={view === "cards"} expanded={expanded} onToggle={onToggle} flashKey={flashKey} />
      )}
      <div aria-hidden className={cn("shrink-0 transition-[height] duration-300 ease-out motion-reduce:transition-none", dirty ? "h-16" : "h-0")} />
    </StepBody>
  )
}
