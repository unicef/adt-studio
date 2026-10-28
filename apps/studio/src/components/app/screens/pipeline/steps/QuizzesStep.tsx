import { useCallback, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { useQuizzes } from "@/hooks/use-quizzes"
import { useBookStructuredTextAvailability } from "@/hooks/use-api-key"
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
import { useStageSurface } from "./shared/useStageSurface"
import { useQuizEdits } from "./quizzes/useQuizEdits"
import type { QuizRow } from "./quizzes/quizRows"
import type { QuizRowContext } from "./quizzes/QuizRowItem"
import { QuizzesOverview } from "./quizzes/QuizzesOverview"
import { QuizzesPageDetail } from "./quizzes/QuizzesPageDetail"
import type { StepProps } from "./shared/types"

const afterPage = (quiz: QuizRow) => [quiz.afterPageId]

export function QuizzesStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const query = useQuizzes(label)
  const activity = useStageActivity("quizzes")
  const run = useRunActivity()
  const hasProvider = useBookStructuredTextAvailability(label)
  const edits = useQuizEdits(label, query.data, activity.isActive)
  const quizzes = edits.items

  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [showRows, setShowRows] = useState(false)
  const [lightboxPageId, setLightboxPageId] = useState<string | null>(null)
  const expandedRows = useExpandedRows()

  const pageNumbers = useMemo(() => new Map(pages.map((page) => [page.pageId, page.pageNumber])), [pages])
  const scoped = usePageScopedItems({ pages, items: quizzes, pagesOf: afterPage })
  const pageAspect = usePageAspect(label, scoped.navPages)
  const nav = usePageNav({ label, slug: plugin.slug, pages: scoped.navPages, allPages: pages })
  const positions = useMemo(() => new Map(quizzes.map((quiz, index) => [quiz.quizId, index + 1])), [quizzes])
  const positionOf = useCallback((quiz: QuizRow) => positions.get(quiz.quizId) ?? 0, [positions])

  const shown = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return quizzes
    return quizzes.filter((quiz) =>
      [quiz.question, ...quiz.options.flatMap((option) => [option.text, option.explanation])].join(" ").toLocaleLowerCase().includes(needle),
    )
  }, [quizzes, search])

  const locked = activity.isActive
  const { editQuiz, editOption, remove, editedKeys } = edits
  const ctx = useMemo<QuizRowContext>(
    () => ({
      label,
      hex: plugin.hex,
      locked,
      ratio: pageAspect.ratio,
      pageNumbers,
      isEdited: (quiz) => editedKeys.has(quiz.quizId),
      onOpenPage: nav.open,
      onOpenThumb: setLightboxPageId,
      onQuiz: editQuiz,
      onOption: editOption,
      onRemove: remove,
    }),
    [label, plugin.hex, locked, pageAspect.ratio, pageNumbers, editedKeys, nav.open, editQuiz, editOption, remove],
  )

  const count = quizzes.length
  const questionsLabel = t`${plural(count, { one: "# question", other: "# questions" })}`
  const every = query.data?.quizzes?.pagesPerQuiz ?? 1
  const surface = useStageSurface({
    label,
    slug: "quizzes",
    hex: plugin.hex,
    ready: count > 0,
    outcome: t`Editing is paused until Quizzes finishes.`,
    hint: {
      title: t`How quizzes work`,
      body: t`AI wrote these questions from the pages listed under each one. Edit any question, answer or feedback, change the correct answer, or remove a question. Saving creates a new version, so you can always go back.`,
    },
    onOpenPage: nav.open,
  })

  const railEntries = usePageRailEntries(label, scoped.navPages, {
    aspect: pageAspect,
    count: (page) => scoped.countOn(page.pageId),
    subtitle: (page) => scoped.itemsOn(page.pageId)[0]?.question,
  })

  const versionDiff = useMemo(() => quizzesVersionDiff(t), [t])
  const serverCount = query.data?.quizzes?.quizzes.length ?? 0
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

  const selected = nav.selected
  const version = query.data?.version ?? null
  const historyVersion = query.data?.historyVersion ?? null

  return (
    <StepShell
      {...props}
      railEmpty={!selected}
      chips={[questionsLabel, t`${plural(every, { one: "A quiz after every page", other: "A quiz every # pages" })}`]}
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
          footer={<Trans>Counts show how many questions come right after each page.</Trans>}
        />
      }
    >
      {selected ? (
        <QuizzesPageDetail
          key={selected.pageId}
          label={label}
          pageId={selected.pageId}
          pageNumber={selected.pageNumber}
          quizzes={scoped.itemsOn(selected.pageId)}
          positionOf={positionOf}
          ctx={ctx}
          prevPageId={nav.prevId}
          nextPageId={nav.nextId}
          onStep={nav.step}
          onClose={nav.close}
        />
      ) : (
        <QuizzesOverview
          label={label}
          meta={questionsLabel}
          top={surface.top}
          help={surface.help}
          quizzes={quizzes}
          shown={shown}
          positionOf={positionOf}
          search={search}
          onSearch={setSearch}
          saveError={edits.saveError}
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
