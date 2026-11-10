import { useCallback, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { SignLanguageVideo } from "@/api/client"
import { useGlossary } from "@/hooks/use-glossary"
import { useSignLanguageVideos } from "@/hooks/use-sign-language-videos"
import { getGlossaryItemTextId } from "@/lib/glossary-video"
import { AddGlossaryDialog } from "@/components/pipeline/stages/glossary/AddGlossaryDialog"
import { useGlossaryOccurrences } from "@/components/pipeline/stages/glossary/lib/occurrences"
import { useVariant } from "@/components/app/lab/variants"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView, useStepRunningView } from "./shared/StepShell"
import { StepVersionPicker } from "./shared/StepVersionPicker"
import { StepRail } from "./shared/ui"
import { glossaryVersionDiff } from "./shared/versionDiffs"
import { usePageNav } from "./shared/usePageNav"
import { usePageRailEntries } from "./shared/usePageRailEntries"
import { usePageScopedItems } from "./shared/list/usePageScopedItems"
import { useExpandedRows } from "./shared/list/useExpandedRows"
import { useRowFlash } from "./shared/list/useRowFlash"
import { useStageSurface } from "./shared/useStageSurface"
import { useGlossaryEdits } from "./glossary/useGlossaryEdits"
import { buildGlossaryList, occurrenceKey, type GlossaryFilter } from "./glossary/glossaryList"
import type { GlossarySort } from "./glossary/SortMenu"
import type { GlossaryRowContext } from "./glossary/GlossaryTermRow"
import type { OccurrencePage } from "./glossary/TermOccurrences"
import type { GlossaryRow } from "./glossary/glossaryRows"
import { GlossaryOverview } from "./glossary/GlossaryOverview"
import { GlossaryPageView } from "./glossary/page/GlossaryPageView"
import type { StepProps } from "./shared/types"

const NO_VIDEOS: SignLanguageVideo[] = []

export function GlossaryStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const query = useGlossary(label)
  const activity = useStageActivity("glossary")
  const run = useRunActivity()
  const edits = useGlossaryEdits(label, query.data, activity.isActive, plugin.hex)
  const rows = edits.items
  const prunedMode = useVariant("pruned")

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<GlossaryFilter>("active")
  const [mineOnly, setMineOnly] = useState(false)
  const mineCount = useMemo(() => rows.filter((row) => row.source === "manual").length, [rows])
  const [seenMine, setSeenMine] = useState(mineCount)
  if (seenMine !== mineCount) {
    setSeenMine(mineCount)
    if (mineCount === 0) setMineOnly(false)
  }
  const [sort, setSort] = useState<GlossarySort>("book")
  const [showAdd, setShowAdd] = useState(false)
  const [showRows, setShowRows] = useState(false)
  const expandedRows = useExpandedRows()
  const { flashKey, reveal } = useRowFlash()

  const { byItem: occurrences, isLoading: occurrencesLoading } = useGlossaryOccurrences(label, rows)
  const videosQuery = useSignLanguageVideos(label)
  const videos = videosQuery.data?.videos ?? NO_VIDEOS

  const pageByNumber = useMemo(() => new Map(pages.map((page) => [page.pageNumber, page])), [pages])
  const occurrencePagesOf = useCallback(
    (row: GlossaryRow): OccurrencePage[] =>
      (occurrences.get(occurrenceKey(row))?.pages ?? [])
        .map((pageNumber) => pageByNumber.get(pageNumber))
        .filter((page): page is NonNullable<typeof page> => !!page)
        .map((page) => ({ pageId: page.pageId, pageNumber: page.pageNumber })),
    [occurrences, pageByNumber],
  )
  const pageIdsOf = useCallback((row: GlossaryRow) => occurrencePagesOf(row).map((page) => page.pageId), [occurrencePagesOf])
  const scoped = usePageScopedItems({ pages, items: rows, pagesOf: pageIdsOf })
  const pageAspect = usePageAspect(label, scoped.navPages)
  const nav = usePageNav({ label, slug: plugin.slug, pages: scoped.navPages, allPages: pages })

  const textIds = useMemo(() => new Map(rows.map((row, index) => [row._key, getGlossaryItemTextId(row, index)])), [rows])
  const videoBySection = useMemo(() => {
    const map = new Map<string, SignLanguageVideo>()
    for (const video of videos) if (video.sectionId) map.set(video.sectionId, video)
    return map
  }, [videos])

  const list = useMemo(
    () => buildGlossaryList(rows, occurrences, prunedMode, { search, filter, mineOnly, sort }),
    [rows, occurrences, prunedMode, search, filter, mineOnly, sort],
  )
  const active = list.counts.active
  const prunedCount = list.counts.pruned
  const termsLabel = t`${plural(active, { one: "# term", other: "# terms" })}`
  const metaLabel = prunedCount > 0 ? t`${termsLabel} · ${plural(prunedCount, { one: "# pruned", other: "# pruned" })}` : termsLabel

  const locked = activity.isActive
  const lockedReason = t`Wait for the glossary to finish generating.`
  const dirtyReason = t`Save or discard your edits first.`

  const { editText, setPicture, setPruned, removeTerm, editedKeys } = edits
  const ctx = useMemo<GlossaryRowContext>(
    () => ({
      label,
      hex: plugin.hex,
      locked,
      videoBlockedReason: locked ? lockedReason : edits.dirty ? dirtyReason : undefined,
      videos,
      occurrencesLoading,
      occurrenceOf: (row) => occurrences.get(occurrenceKey(row)),
      pagesOf: occurrencePagesOf,
      textIdOf: (row) => textIds.get(row._key) ?? "",
      videoOf: (row) => videoBySection.get(textIds.get(row._key) ?? "") ?? null,
      isEdited: (row) => editedKeys.has(row._key),
      onOpenPage: nav.open,
      onText: editText,
      onPicture: setPicture,
      onPrune: setPruned,
      onRemove: removeTerm,
    }),
    [label, plugin.hex, locked, lockedReason, edits.dirty, dirtyReason, videos, occurrencesLoading, occurrences, occurrencePagesOf, textIds, videoBySection, editedKeys, nav.open, editText, setPicture, setPruned, removeTerm],
  )

  const surface = useStageSurface({
    label,
    slug: "glossary",
    hex: plugin.hex,
    pages,
    ready: active > 0,
    outcome: t`Editing is paused until Glossary finishes.`,
    hint: {
      title: t`How the glossary works`,
      body: t`AI picked these terms from the book. Edit a definition, its emojis or picture, add your own terms, or prune the ones you don't want. Pruned terms stay out of the book and out of future runs. Saving creates a new version, so you can always go back.`,
    },
    onOpenPage: nav.open,
    hasOutput: (query.data?.items.length ?? 0) > 0,
  })

  const railEntries = usePageRailEntries(label, scoped.navPages, {
    aspect: pageAspect,
    total: active,
    count: (page) => scoped.countOn(page.pageId),
    subtitle: (page) =>
      scoped
        .itemsOn(page.pageId)
        .slice(0, 3)
        .map((row) => row.word)
        .join(", "),
  })

  const versionDiff = useMemo(() => glossaryVersionDiff(t), [t])
  const serverCount = query.data?.items.length ?? 0
  const loading = useStepLoading(props, { isLoading: query.isLoading, hasOutput: serverCount > 0 })
  const runningView = useStepRunningView({
    ...props,
    stage: activity,
    isCancelling: run.isCancelling,
    onCancel: run.cancelRun,
    outcome: t`Terms show up here once the glossary is written.`,
  })
  const loadingView = useStepLoadingView(props, { shape: "list" })
  const emptyView = useStepEmptyView(props)
  const phaseView = activity.isActive && serverCount === 0 ? runningView : loading ? loadingView : serverCount === 0 ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  const addTerm = (item: Parameters<typeof edits.addTerm>[0]) => {
    const key = edits.addTerm(item)
    setSearch("")
    setFilter("active")
    setMineOnly(false)
    setShowRows(true)
    expandedRows.expand(key)
    reveal(key)
  }

  const clearFilters = () => {
    setSearch("")
    setFilter("active")
    setMineOnly(false)
  }

  const selected = nav.selected

  return (
    <StepShell
      {...props}
      railEmpty={!selected}
      chips={[metaLabel]}
      headerExtra={
        <StepVersionPicker
          label={label}
          step="glossary"
          currentVersion={query.data?.version ?? null}
          isSaving={edits.saving}
          dirty={edits.dirty}
          onRestored={edits.discard}
          diff={versionDiff}
        />
      }
      rail={
        <StepRail
          heading={<Trans>Terms by page</Trans>}
          hex={plugin.hex}
          entries={railEntries}
          activeKey={selected?.pageId ?? ""}
          onSelect={(key) => (key ? nav.open(key) : nav.close())}
          footer={<Trans>Counts show how many terms appear on each page.</Trans>}
        />
      }
    >
      {selected ? (
        <GlossaryPageView
          key={selected.pageId}
          label={label}
          pageId={selected.pageId}
          pageNumber={selected.pageNumber}
          rows={scoped.itemsOn(selected.pageId)}
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
        <GlossaryOverview
          label={label}
          hex={plugin.hex}
          meta={metaLabel}
          top={surface.top}
          help={surface.help}
          list={list}
          search={search}
          onSearch={setSearch}
          filter={filter}
          onFilter={setFilter}
          mineOnly={mineOnly}
          onMineOnly={setMineOnly}
          sort={sort}
          onSort={setSort}
          onClearFilters={clearFilters}
          saveError={edits.saveError}
          ctx={ctx}
          expanded={expandedRows.open}
          onToggle={expandedRows.toggle}
          flashKey={flashKey}
          addDisabledReason={locked ? lockedReason : undefined}
          onAdd={() => setShowAdd(true)}
          navPages={scoped.navPages}
          aspect={pageAspect}
          rowsOn={scoped.itemsOn}
          onOpenPage={nav.open}
          showRows={showRows}
          onShowRows={() => setShowRows(true)}
        />
      )}
      <AddGlossaryDialog open={showAdd} onOpenChange={setShowAdd} bookLabel={label} existingItems={rows} onAdd={addTerm} />
    </StepShell>
  )
}
