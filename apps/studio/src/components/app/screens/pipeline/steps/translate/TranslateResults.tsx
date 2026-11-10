import { useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Languages, RotateCcw, Settings2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { cn } from "@/lib/utils"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import type { CatalogCategory } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import { ImageLightbox } from "@/components/pipeline/stages/languages/components/ImageLightbox"
import { useRerunConfirm } from "@/components/app/screens/pipeline/runs/useRerunConfirm"
import { useStageRerun } from "@/components/app/screens/pipeline/runs/useStageRerun"
import { isStepSettingsSlug } from "@/components/app/screens/pipeline/settings/slugs"
import { HEADER_BUTTON, HEADER_BUTTON_LABELLED, HeaderButtonTile } from "../shared/headerButton"
import { NoMatches } from "../shared/list/NoMatches"
import type { StepNote } from "../shared/notes/NoteRow"
import { StepShell } from "../shared/StepShell"
import { StepSearch } from "../shared/StepSearch"
import { StepVersionPicker } from "../shared/StepVersionPicker"
import type { StepProps } from "../shared/types"
import { SaveError, StepEmptyHint, StepRail, StepScrollBody, STEP_FILL_VIEWPORT_CLASSNAME } from "../shared/ui"
import { useStageSurface } from "../shared/useStageSurface"
import { translationVersionDiff } from "../shared/versionDiffs"
import { ReviewButton, ReviewNotices } from "./review/ReviewControls"
import { matchesReviewFilter, type ReviewFilter, type ReviewItem } from "./review/reviewState"
import { useTranslationReview } from "./review/useTranslationReview"
import type { ImageOpen } from "./TranslateRow"
import { TranslateRowList, type ScrollRequest } from "./TranslateRowList"
import { TranslateToolbar, type TranslateView } from "./TranslateToolbar"
import {
  buildRows,
  countByCategory,
  countTranslated,
  countUntranslated,
  filterRows,
  isBaseLanguage,
  NO_FILTER,
  sourceEntriesOf,
  type RowFilter,
} from "./translateState"
import { languageName } from "./languageName"
import { usePlaceLabel } from "./usePlaceLabel"
import type { useTranslateData } from "./useTranslateData"
import { useTranslationSave } from "./useTranslationSave"

const REVIEW_VIEWS = new Set<TranslateView>(["needs-attention", "acceptable", "accepted-anyway"])

export function TranslateResults({ data, done, ...props }: StepProps & { data: ReturnType<typeof useTranslateData>; done: boolean }) {
  const { label, plugin, pages, frame } = props
  const { t, i18n } = useLingui()
  const { languages, baseLanguage, easyRead, translatedImages } = data
  const catalog = data.catalog!
  const stageName = getStageLabelI18n("translate")

  const [active, setActive] = useState<string | null>(null)
  const [filter, setFilter] = useState<RowFilter>(NO_FILTER)
  const [view, setView] = useState<TranslateView>("all")
  const [lightbox, setLightbox] = useState<ImageOpen | null>(null)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [scrollTo, setScrollTo] = useState<ScrollRequest | null>(null)

  const language = active ?? languages[0] ?? ""
  const isBase = isBaseLanguage(language, baseLanguage)
  const save = useTranslationSave(label, language, isBase)
  const rerun = useStageRerun(label, "translate")
  const confirm = useRerunConfirm("translate", rerun)

  const rows = useMemo(() => buildRows(catalog, language, isBase, easyRead), [catalog, language, isBase, easyRead])
  const sourceIds = useMemo(() => new Set(sourceEntriesOf(catalog, easyRead).map((entry) => entry.id)), [catalog, easyRead])
  const sourceById = useMemo(() => new Map(rows.map((row) => [row.id, row.source])), [rows])
  const targetById = useMemo(() => new Map(rows.map((row) => [row.id, row.target])), [rows])
  const total = rows.length

  const missingByLanguage = useMemo(() => {
    const map = new Map<string, number>()
    for (const code of languages) {
      if (isBaseLanguage(code, baseLanguage)) continue
      map.set(code, sourceIds.size - countTranslated(sourceIds, catalog.translations[code]?.entries))
    }
    return map
  }, [languages, baseLanguage, sourceIds, catalog])
  const missingTotal = useMemo(() => [...missingByLanguage.values()].reduce((sum, count) => sum + count, 0), [missingByLanguage])

  const scopeIds = useMemo(
    () => filterRows(rows, { ...NO_FILTER, category: filter.category, pageId: filter.pageId }).map((row) => row.id),
    [rows, filter.category, filter.pageId],
  )

  const openPage = useCallback((pageId: string) => setFilter((current) => ({ ...current, pageId })), [])
  const notes = useMemo<StepNote[]>(() => {
    if (!done || missingTotal === 0) return []
    const here = missingByLanguage.get(language) ?? 0
    return [
      {
        id: "untranslated",
        icon: Languages,
        attention: true,
        title: t`${plural(missingTotal, { one: "# string isn't translated", other: "# strings aren't translated" })}`,
        body: t`Translate missing fills them in. Translations you already have, and your edits, are kept.`,
        actions: [
          { label: <Trans>Translate missing</Trans>, primary: true, onClick: confirm.request, disabled: !confirm.canRun, disabledReason: confirm.disabledReason },
          ...(here > 0 && view !== "untranslated" ? [{ label: <Trans>Show them</Trans>, quiet: true, onClick: () => setView("untranslated") }] : []),
        ],
      },
    ]
  }, [done, missingTotal, missingByLanguage, language, view, confirm.request, confirm.canRun, confirm.disabledReason, t])

  const surface = useStageSurface({
    label,
    slug: "translate",
    hex: plugin.hex,
    pages,
    ready: true,
    outcome: t`Editing is paused until ${stageName} finishes.`,
    hint: {
      title: t`How translations work`,
      body: t`AI translated every string of the book into each language you picked. Pick a language on the left, then click any translation to fix it. Each save keeps the old version, so you can always go back.`,
    },
    notes,
    onOpenPage: openPage,
    hasOutput: true,
  })
  const locked = surface.locked

  const review = useTranslationReview({
    label,
    language,
    enabled: data.reviewEnabled && !isBase,
    scopeIds,
    pageId: filter.pageId,
    sourceById,
    targetById,
    locked,
  })

  const reviewView = REVIEW_VIEWS.has(view) && review.hasResults ? (view as ReviewFilter) : null
  const activeView: TranslateView = view === "untranslated" || reviewView ? view : "all"
  const rowFilter = useMemo<RowFilter>(() => ({ ...filter, status: activeView === "untranslated" ? "untranslated" : "all" }), [filter, activeView])
  const byReview = useCallback(
    (list: typeof rows) => (reviewView ? list.filter((row) => matchesReviewFilter(review.items.get(row.id), reviewView)) : list),
    [reviewView, review.items],
  )
  const shown = useMemo(() => byReview(filterRows(rows, rowFilter)), [byReview, rows, rowFilter])
  const categoryRows = useMemo(() => byReview(filterRows(rows, rowFilter, "category")), [byReview, rows, rowFilter])
  const categoryCounts = useMemo(() => countByCategory(categoryRows), [categoryRows])
  const viewRows = useMemo(() => filterRows(rows, rowFilter, "status"), [rows, rowFilter])
  const viewCounts = useMemo(() => {
    const counts = { untranslated: isBase ? 0 : countUntranslated(viewRows), needsAttention: 0, acceptable: 0, acceptedAnyway: 0 }
    for (const row of viewRows) {
      const item = review.items.get(row.id)
      if (!item) continue
      if (item.acceptable) counts.acceptable += 1
      else if (item.accepted_anyway) counts.acceptedAnyway += 1
      else counts.needsAttention += 1
    }
    return counts
  }, [viewRows, review.items, isBase])
  const untranslated = missingByLanguage.get(language) ?? 0

  const filterPages = useMemo(() => {
    const withRows = new Set(rows.map((row) => row.pageId).filter(Boolean))
    return pages.filter((page) => withRows.has(page.pageId))
  }, [pages, rows])
  const pageNumber = filter.pageId ? (pages.find((page) => page.pageId === filter.pageId)?.pageNumber ?? Number(filter.pageId.slice(2, 5))) : null

  const placeOf = usePlaceLabel(pages, sourceById)
  const translatedImageOf = useCallback((id: string) => translatedImages.get(`${id}::${language}`), [translatedImages, language])
  const reviewOf = useCallback((id: string): ReviewItem | undefined => review.items.get(id) ?? review.applied.get(id), [review.items, review.applied])
  const { markApplied, acceptAnyway } = review
  const items = review.items
  const applySuggestion = useCallback(
    (id: string, text: string, previous: string) => {
      const item = items.get(id)
      save.save(id, text, previous)
      if (item) markApplied(item)
    },
    [items, save, markApplied],
  )
  const openImage = useCallback((image: ImageOpen) => setLightbox(image), [])

  const selectLanguage = (code: string | null) => {
    if (!code) return
    setActive(code)
    setFilter(NO_FILTER)
    setView("all")
  }
  const clearFilters = () => {
    setFilter((current) => ({ ...NO_FILTER, search: current.search }))
    setView("all")
  }

  const versionDiff = useMemo(() => translationVersionDiff(t, new Map(catalog.entries.map((entry) => [entry.id, entry.text]))), [catalog, t])
  const version = isBase ? catalog.version : (catalog.translations[language]?.version ?? null)
  const sourceName = languageName(baseLanguage, i18n.locale)
  const targetName = languageName(language, i18n.locale)

  const meta = isBase
    ? t`${plural(total, { one: "# string", other: "# strings" })} · book language`
    : untranslated > 0
      ? t`${plural(total, { one: "# string", other: "# strings" })} · ${untranslated} untranslated`
      : t`${plural(total, { one: "# string", other: "# strings" })} · all translated`

  const nextIssue = () => {
    const issues = shown.filter((row) => {
      const item = review.items.get(row.id)
      return item && !item.acceptable && !item.accepted_anyway
    })
    if (issues.length === 0) return
    const after = issues.findIndex((row) => row.id === scrollTo?.id)
    const target = issues[(after + 1) % issues.length]
    setScrollTo({ id: target.id, nonce: Date.now() })
  }

  const rerunLabel = rerun.hasError ? <Trans>Try again</Trans> : <Trans>Translate again</Trans>
  const searching = filter.search.trim() !== ""

  return (
    <StepShell
      {...props}
      chips={[meta]}
      headerExtra={
        <StepVersionPicker
          label={label}
          step="text-catalog-translation"
          itemId={language}
          currentVersion={version}
          isSaving={[...save.rows.values()].some((row) => row.state === "saving")}
          diff={versionDiff}
        />
      }
      bodyViewportClassName={STEP_FILL_VIEWPORT_CLASSNAME}
      rail={
        <StepRail
          heading={<Trans>Output languages</Trans>}
          hex={plugin.hex}
          searchPlaceholder={t`Find a language`}
          entries={languages.map((code) => {
            const base = isBaseLanguage(code, baseLanguage)
            const translated = total - (missingByLanguage.get(code) ?? 0)
            return {
              key: code,
              title: languageName(code, i18n.locale),
              subtitle: base ? t`Book language` : translated >= total ? t`All translated` : t`${translated} of ${total} translated`,
              count: base ? total : translated,
              searchText: code,
            }
          })}
          activeKey={language}
          onSelect={selectLanguage}
          footer={
            isStepSettingsSlug(plugin.slug) ? (
              <button
                type="button"
                onClick={() => frame.onOpenSettings(plugin.slug)}
                className="flex items-center gap-1.5 text-left font-medium text-foreground underline-offset-4 transition-colors hover:underline"
              >
                <Settings2 aria-hidden className="size-3.5 text-muted-foreground" />
                <Trans>Add or remove languages</Trans>
              </button>
            ) : (
              <Trans>{total} source strings in the catalog.</Trans>
            )
          }
        />
      }
    >
      <StepScrollBody
        viewportRef={setScrollElement}
        title={isBase ? <Trans>Source text</Trans> : targetName}
        meta={meta}
        actions={
          <>
            {surface.help}
            <StepSearch
              value={filter.search}
              onChange={(search) => setFilter((current) => ({ ...current, search }))}
              placeholder={t`Search text or translation…`}
              ariaLabel={t`Search source text, translations and ids`}
              matches={{ shown: shown.length, total }}
              className="max-lg:w-[200px]"
            />
            {!isBase && <ReviewButton review={review} />}
            {!locked && (
              <button
                type="button"
                onClick={confirm.request}
                aria-disabled={!confirm.canRun || undefined}
                title={confirm.disabledReason ?? t`Run ${stageName} again. Strings that didn't change come back from the cache.`}
                className={cn(HEADER_BUTTON, HEADER_BUTTON_LABELLED, "max-xl:pr-1.5", !confirm.canRun && "cursor-default opacity-45 hover:translate-y-0 hover:shadow-sm")}
              >
                <HeaderButtonTile icon={RotateCcw} />
                <span className="max-xl:sr-only">{rerunLabel}</span>
              </button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-3 pb-24">
          {surface.top}
          {!isBase && <ReviewNotices review={review} hex={plugin.hex} />}
          {!isBase && review.hasResults && (
            <div role="status" className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
              <span>
                {viewCounts.needsAttention > 0
                  ? t`Review: ${viewCounts.acceptable} look right, ${viewCounts.needsAttention} need attention.`
                  : t`Review: every reviewed translation looks right.`}
              </span>
              {viewCounts.needsAttention > 0 && (
                <button type="button" onClick={nextIssue} className="font-semibold text-foreground underline-offset-4 transition-colors hover:underline">
                  <Trans>Next issue</Trans>
                </button>
              )}
            </div>
          )}
          <SaveError error={save.error} />
          <TranslateToolbar
            hex={plugin.hex}
            isBase={isBase}
            category={filter.category}
            categoryCounts={categoryCounts}
            categoryTotal={categoryRows.length}
            onCategory={(category: CatalogCategory) => setFilter((current) => ({ ...current, category }))}
            view={activeView}
            viewTotal={viewRows.length}
            viewCounts={viewCounts}
            showReview={review.hasResults}
            onView={setView}
            pages={filterPages}
            pageNumber={pageNumber}
            onPage={(pageId) => setFilter((current) => ({ ...current, pageId }))}
            shown={shown.length}
            columns={isBase || shown.length === 0 ? null : { source: t`${sourceName} · book language`, target: targetName }}
          />
          {shown.length === 0 ? (
            searching ? (
              <NoMatches query={filter.search} noun={t`strings`} onClear={() => setFilter((current) => ({ ...current, search: "" }))} />
            ) : (
              <StepEmptyHint>
                <span className="flex flex-col items-center gap-2">
                  {activeView === "untranslated" ? t`Every string here is translated.` : t`No strings match these filters.`}
                  <button type="button" onClick={clearFilters} className="font-medium text-foreground underline-offset-4 transition-colors hover:underline">
                    {t`Clear filters`}
                  </button>
                </span>
              </StepEmptyHint>
            )
          ) : (
            <TranslateRowList
              key={language}
              scrollElement={scrollElement}
              rows={shown}
              label={label}
              hex={plugin.hex}
              language={language}
              isBase={isBase}
              locked={locked}
              placeOf={placeOf}
              translatedImageOf={translatedImageOf}
              saves={save.rows}
              reviewOf={reviewOf}
              appliedIds={review.applied}
              accepting={review.accepting}
              scrollTo={scrollTo}
              onSave={save.save}
              onUndo={save.undo}
              onRetry={save.retry}
              onApplySuggestion={applySuggestion}
              onAcceptAnyway={acceptAnyway}
              onOpenImage={openImage}
            />
          )}
        </div>
        {confirm.dialogs}
      </StepScrollBody>

      {lightbox && createPortal(<ImageLightbox src={lightbox.src} caption={lightbox.caption} onClose={() => setLightbox(null)} />, document.body)}
    </StepShell>
  )
}
