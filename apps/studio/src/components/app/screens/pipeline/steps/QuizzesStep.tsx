import { useCallback, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { useQuizzes } from "@/hooks/use-quizzes"
import { useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { PageLightbox } from "@/components/pipeline/components/PageLightbox"
import { AddQuizDialog } from "@/components/pipeline/stages/quizzes/AddQuizDialog"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView, useStepRunningView } from "./shared/StepShell"
import { StepVersionPicker } from "./shared/StepVersionPicker"
import { StepRail } from "./shared/ui"
import { quizzesVersionDiff } from "./shared/versionDiffs"
import { usePageNav } from "./shared/usePageNav"
import { usePageRailEntries } from "./shared/usePageRailEntries"
import { usePageScopedItems } from "./shared/list/usePageScopedItems"
import { useExpandedRows } from "./shared/list/useExpandedRows"
import { pageNumbersOf } from "./shared/list/pageJump"
import { useStageSurface } from "./shared/useStageSurface"
import { useQuizEdits } from "./quizzes/useQuizEdits"
import { useQuizList } from "./quizzes/useQuizList"
import { buildPageIndex, formatSourcePages } from "./quizzes/quizPages"
import { quizMatches, type QuizRow } from "./quizzes/quizRows"
import type { QuizRowContext } from "./quizzes/QuizRowItem"
import type { QuizJumpEntry } from "./quizzes/QuizJumpMenu"
import { QuizzesOverview } from "./quizzes/QuizzesOverview"
import { QuizzesPageView } from "./quizzes/page/QuizzesPageView"
import { quizPagesOf, quizzesOnPage } from "./quizzes/page/pageQuizzes"
import type { StepProps } from "./shared/types"

const NO_QUIZZES: QuizRow[] = []

export function QuizzesStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const query = useQuizzes(label)
  const activity = useStageActivity("quizzes")
  const run = useRunActivity()
  const hasProvider = useBookStructuredTextAvailability(label)
  const edits = useQuizEdits(label, query.data, activity.isActive, plugin.hex)
  const serverQuizzes = query.data?.quizzes?.quizzes ?? NO_QUIZZES
  const list = useQuizList(serverQuizzes, edits.items)
  const quizzes = edits.items

  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [showRows, setShowRows] = useState(false)
  const [lightboxPageId, setLightboxPageId] = useState<string | null>(null)
  const expandedRows = useExpandedRows()

  const pageIndex = useMemo(() => buildPageIndex(pages), [pages])
  const pagesById = useMemo(() => new Map(pages.map((page) => [page.pageId, page])), [pages])
  const scoped = usePageScopedItems({ pages, items: quizzes, pagesOf: quizPagesOf })
  const pageAspect = usePageAspect(label, scoped.navPages)
  const nav = usePageNav({ label, slug: plugin.slug, pages: scoped.navPages, allPages: pages })
  const rangeOf = useCallback((quiz: QuizRow) => formatSourcePages(quiz.pageIds, pageIndex), [pageIndex])

  const shown = useMemo(() => list.listed.filter((row) => row.leaving || quizMatches(row.quiz, search)), [list.listed, search])
  const jumpEntries = useMemo<QuizJumpEntry[]>(
    () =>
      list.rows.map(({ quiz, position, removed }) => ({
        key: quiz.quizId,
        position,
        question: quiz.question,
        pages: rangeOf(quiz),
        pageNumbers: quiz.pageIds.flatMap((pageId) => {
          const page = pagesById.get(pageId)
          return page ? pageNumbersOf(page) : []
        }),
        removed,
      })),
    [list.rows, rangeOf, pagesById],
  )

  const locked = activity.isActive
  const { editQuiz, editOption, remove, insert, editedKeys } = edits
  const { restoreAfter } = list
  const undo = useCallback(
    (key: string) => {
      const quiz = serverQuizzes.find((entry) => entry.quizId === key)
      if (quiz) insert(quiz, restoreAfter(key))
    },
    [serverQuizzes, insert, restoreAfter],
  )
  const ctx = useMemo<QuizRowContext>(
    () => ({
      label,
      hex: plugin.hex,
      locked,
      ratio: pageAspect.ratio,
      pageNumbers: pageIndex.numberOf,
      rangeOf,
      isEdited: (quiz) => editedKeys.has(quiz.quizId),
      onOpenPage: nav.open,
      onOpenThumb: setLightboxPageId,
      onQuiz: editQuiz,
      onOption: editOption,
      onRemove: remove,
      onUndo: undo,
    }),
    [label, plugin.hex, locked, pageAspect.ratio, pageIndex, rangeOf, editedKeys, nav.open, editQuiz, editOption, remove, undo],
  )

  const count = quizzes.length
  const serverCount = serverQuizzes.length
  const questionsLabel = t`${plural(count, { one: "# question", other: "# questions" })}`
  const every = query.data?.quizzes?.pagesPerQuiz ?? 1
  const everyLabel = t`${plural(every, { one: "one after every page", other: "one every # pages" })}`
  const surface = useStageSurface({
    label,
    slug: "quizzes",
    hex: plugin.hex,
    pages,
    ready: count > 0,
    outcome: t`Editing is paused until ${getStageLabelI18n("quizzes")} finishes.`,
    hint: {
      title: t`How quizzes work`,
      body: t`AI wrote these questions from the pages listed under each one. Edit any question, answer or feedback, change the correct answer, or remove a question. Saving creates a new version, so you can always go back.`,
    },
    onOpenPage: nav.open,
    hasOutput: serverCount > 0,
  })

  const railEntries = usePageRailEntries(label, scoped.navPages, {
    aspect: pageAspect,
    count: (page) => scoped.countOn(page.pageId),
    subtitle: (page) => scoped.itemsOn(page.pageId)[0]?.question,
  })

  const selected = nav.selected
  const pageItems = useMemo(() => (selected ? quizzesOnPage(list.rows, selected.pageId) : []), [selected, list.rows])

  const versionDiff = useMemo(() => quizzesVersionDiff(t), [t])
  const loading = useStepLoading(props, { isLoading: query.isLoading, hasOutput: serverCount > 0 })
  const runningView = useStepRunningView({
    ...props,
    stage: activity,
    isCancelling: run.isCancelling,
    onCancel: run.cancelRun,
    outcome: t`Questions show up here once they are written.`,
  })
  const loadingView = useStepLoadingView(props, { shape: "list" })
  const emptyView = useStepEmptyView(props)
  const phaseView = activity.isActive && serverCount === 0 ? runningView : loading ? loadingView : serverCount === 0 ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  const addDisabledReason = locked
    ? t`Wait for the quizzes to finish generating.`
    : edits.dirty
      ? t`Save or discard your edits first.`
      : !hasProvider
        ? t`Set up AI access in Book settings to add a quiz.`
        : undefined

  const version = query.data?.version ?? null
  const historyVersion = query.data?.historyVersion ?? null

  return (
    <StepShell
      {...props}
      railEmpty={!selected}
      chips={[questionsLabel, everyLabel]}
      headerExtra={
        <StepVersionPicker
          label={label}
          step="quiz-generation"
          currentVersion={version}
          historyVersion={historyVersion}
          currentVersionInactive={version == null && historyVersion != null}
          isSaving={edits.saving}
          dirty={edits.dirty}
          onRestored={edits.discard}
          diff={versionDiff}
        />
      }
      rail={
        <StepRail
          heading={<Trans>Questions by page</Trans>}
          hex={plugin.hex}
          entries={railEntries}
          activeKey={selected?.pageId ?? ""}
          onSelect={(key) => (key ? nav.open(key) : nav.close())}
          footer={<Trans>Counts show how many questions were made from each page, or are shown after it.</Trans>}
        />
      }
    >
      {selected ? (
        <QuizzesPageView
          key={selected.pageId}
          label={label}
          pageId={selected.pageId}
          pageNumber={selected.pageNumber}
          hex={plugin.hex}
          items={pageItems}
          ctx={ctx}
          saveError={edits.saveError}
          prevPageId={nav.prevId}
          nextPageId={nav.nextId}
          onStep={nav.step}
          onClose={nav.close}
          problem={surface.problem}
          retry={surface.retry}
        />
      ) : (
        <QuizzesOverview
          label={label}
          hex={plugin.hex}
          meta={`${questionsLabel} · ${everyLabel}`}
          top={surface.top}
          help={surface.help}
          total={list.rows.length}
          shown={shown}
          jumpEntries={jumpEntries}
          search={search}
          onSearch={setSearch}
          saveError={edits.saveError}
          dirty={edits.dirty}
          ctx={ctx}
          expanded={expandedRows.open}
          onToggle={expandedRows.toggle}
          addDisabledReason={addDisabledReason}
          onAdd={() => setShowAdd(true)}
          navPages={scoped.navPages}
          aspect={pageAspect}
          quizzesOn={scoped.itemsOn}
          onOpenPage={nav.open}
          showRows={showRows}
          onShowRows={() => setShowRows(true)}
        />
      )}
      <PageLightbox
        bookLabel={label}
        pageId={lightboxPageId}
        open={lightboxPageId != null}
        onOpenChange={(open) => {
          if (!open) setLightboxPageId(null)
        }}
      />
      <AddQuizDialog open={showAdd} onOpenChange={setShowAdd} bookLabel={label} onCreated={() => setShowAdd(false)} />
    </StepShell>
  )
}
