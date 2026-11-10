import { useCallback, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { TocEntry, TocSection } from "@/api/client"
import { useToc } from "@/hooks/use-toc"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { useTocSections } from "./shared/queries"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView, useStepRunningView } from "./shared/StepShell"
import { StepVersionPicker } from "./shared/StepVersionPicker"
import { StepRail } from "./shared/ui"
import { tocVersionDiff } from "./shared/versionDiffs"
import { usePageNav } from "./shared/usePageNav"
import { usePageRailEntries } from "./shared/usePageRailEntries"
import { usePageScopedItems } from "./shared/list/usePageScopedItems"
import { useRowFlash } from "./shared/list/useRowFlash"
import { useStageSurface } from "./shared/useStageSurface"
import { useTocEdits } from "./toc/useTocEdits"
import { entryPageIds, levelsUsed, MIN_TOC_LEVEL } from "./toc/tocRows"
import type { TocRowContext } from "./toc/TocEntryRow"
import { TocOverview } from "./toc/TocOverview"
import { TocPageView } from "./toc/page/TocPageView"
import { useTocSectionOptions } from "./toc/useTocSectionOptions"
import type { StepProps } from "./shared/types"

const NO_SECTIONS: TocSection[] = []

export function TocStep(props: StepProps) {
  const { label, plugin, pages, frame } = props
  const { t } = useLingui()
  const query = useToc(label)
  const activity = useStageActivity("toc")
  const run = useRunActivity()
  const edits = useTocEdits(label, query.data, activity.isActive, plugin.hex)
  const entries = edits.items
  const serverCount = query.data?.entries.length ?? 0
  const sectionsQuery = useTocSections(label, serverCount > 0)
  const sections = useTocSectionOptions(sectionsQuery.data ?? NO_SECTIONS, pages)

  const [level, setLevel] = useState("")
  const [search, setSearch] = useState("")
  const [showRows, setShowRows] = useState(false)
  const [freshId, setFreshId] = useState<string | null>(null)
  const { flashKey, reveal } = useRowFlash()

  const pageIdByNumber = useMemo(() => new Map(pages.map((page) => [page.pageNumber, page.pageId])), [pages])
  const pageNumberById = useMemo(() => new Map(pages.map((page) => [page.pageId, page.pageNumber])), [pages])
  const pagesOf = useCallback((entry: TocEntry) => entryPageIds(entry, sections, pageIdByNumber), [sections, pageIdByNumber])
  const pageOf = useCallback(
    (entry: TocEntry) => {
      const pageId = pagesOf(entry)[0]
      const pageNumber = pageId ? pageNumberById.get(pageId) : undefined
      return pageId && pageNumber != null ? { pageId, pageNumber } : null
    },
    [pagesOf, pageNumberById],
  )
  const scoped = usePageScopedItems({ pages, items: entries, pagesOf })
  const pageAspect = usePageAspect(label, scoped.navPages)
  const nav = usePageNav({ label, slug: plugin.slug, pages: scoped.navPages, allPages: pages })

  const levels = useMemo(() => levelsUsed(entries), [entries])
  const shown = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    return entries.filter((entry) => (level === "" || String(entry.level) === level) && (!needle || entry.title.toLocaleLowerCase().includes(needle)))
  }, [entries, level, search])

  const locked = activity.isActive
  const { update, shift, addAfter, remove, editedKeys } = edits
  const openPreview = frame.onOpenPreview
  const openPage = nav.open
  const insertAfter = useCallback(
    (afterId: string | null, entryLevel: number) => {
      setSearch("")
      setLevel("")
      const id = addAfter(afterId, entryLevel)
      setFreshId(id)
      reveal(id)
    },
    [addAfter, reveal],
  )
  const ctx = useMemo<TocRowContext>(
    () => ({
      hex: plugin.hex,
      locked,
      sections,
      sectionsFailed: sectionsQuery.isError,
      onRetrySections: () => void sectionsQuery.refetch(),
      isEdited: (entry) => editedKeys.has(entry.id),
      freshId,
      flashId: flashKey,
      onPatch: (id, patch) => update(id, patch),
      onShift: shift,
      onAddAfter: insertAfter,
      onRemove: remove,
      onPreview: (sectionId) => openPreview(sectionId),
      pageOf,
      onOpenPage: openPage,
    }),
    [plugin.hex, locked, sections, sectionsQuery, editedKeys, freshId, flashKey, update, shift, insertAfter, remove, openPreview, pageOf, openPage],
  )

  const count = entries.length
  const meta = t`${plural(count, { one: "# entry", other: "# entries" })} · ${plural(levels.length, { one: "# level", other: "# levels" })}`
  const surface = useStageSurface({
    label,
    slug: "toc",
    hex: plugin.hex,
    pages,
    ready: count > 0,
    hasOutput: serverCount > 0,
    hintOpen: true,
    outcome: t`Editing is paused until the table of contents is done.`,
    hint: {
      title: t`How the table of contents works`,
      body: t`These titles become the book's navigation menu. Rename them, change their level, link each one to a section, or add your own. Saving creates a new version, so you can always go back.`,
    },
    onOpenPage: openPage,
  })

  const railEntries = usePageRailEntries(label, scoped.navPages, {
    aspect: pageAspect,
    count: (page) => scoped.countOn(page.pageId),
    subtitle: (page) => scoped.itemsOn(page.pageId)[0]?.title,
  })

  const versionDiff = useMemo(() => tocVersionDiff(t), [t])
  const loading = useStepLoading(props, { isLoading: query.isLoading, hasOutput: serverCount > 0 })
  const runningView = useStepRunningView({
    ...props,
    stage: activity,
    isCancelling: run.isCancelling,
    onCancel: run.cancelRun,
    outcome: t`Entries show up here once the table of contents is written.`,
  })
  const loadingView = useStepLoadingView(props, { shape: "list" })
  const emptyView = useStepEmptyView(props)
  const phaseView = activity.isActive && serverCount === 0 ? runningView : loading ? loadingView : serverCount === 0 ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  const selected = nav.selected

  return (
    <StepShell
      {...props}
      railEmpty={!selected}
      chips={[]}
      headerExtra={
        <StepVersionPicker
          label={label}
          step="toc-generation"
          currentVersion={query.data?.version ?? null}
          isSaving={edits.saving}
          dirty={edits.dirty}
          onRestored={edits.discard}
          diff={versionDiff}
        />
      }
      rail={
        <StepRail
          heading={<Trans>Entries by page</Trans>}
          hex={plugin.hex}
          entries={railEntries}
          activeKey={selected?.pageId ?? ""}
          onSelect={(key) => (key ? nav.open(key) : nav.close())}
          footer={<Trans>Counts show how many entries link to each page.</Trans>}
        />
      }
    >
      {selected ? (
        <TocPageView
          key={selected.pageId}
          label={label}
          pageId={selected.pageId}
          pageNumber={selected.pageNumber}
          hex={plugin.hex}
          entries={scoped.itemsOn(selected.pageId)}
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
        <TocOverview
          label={label}
          hex={plugin.hex}
          meta={meta}
          top={surface.top}
          help={surface.help}
          entries={entries}
          shown={shown}
          levels={levels}
          level={level}
          onLevel={setLevel}
          search={search}
          onSearch={setSearch}
          saveError={edits.saveError}
          dirty={edits.dirty}
          ctx={ctx}
          addDisabledReason={locked ? t`Wait for the table of contents to finish generating.` : undefined}
          onAddEnd={() => insertAfter(null, MIN_TOC_LEVEL)}
          navPages={scoped.navPages}
          aspect={pageAspect}
          entriesOn={scoped.itemsOn}
          onOpenPage={nav.open}
          showRows={showRows}
          onShowRows={() => setShowRows(true)}
        />
      )}
    </StepShell>
  )
}
