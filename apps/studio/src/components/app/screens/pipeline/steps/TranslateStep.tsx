import { useCallback, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Search } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { TextCatalogEntry } from "@/api/client"
import { Input } from "@/components/ui/input"
import { useBook } from "@/hooks/use-books"
import { useActiveConfig } from "@/hooks/use-debug"
import type { CatalogCategory } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import { ImageLightbox } from "@/components/pipeline/stages/languages/components/ImageLightbox"
import { useSaveTranslation } from "./shared/mutations"
import { useTextCatalog } from "./shared/queries"
import { StepEmpty, StepLoading, StepShell, useStepLoading } from "./shared/StepShell"
import { StepVersionPicker } from "./shared/StepVersionPicker"
import { SaveError, StepEmptyHint, StepRail, StepScrollBody, STEP_FILL_VIEWPORT_CLASSNAME } from "./shared/ui"
import { translationVersionDiff } from "./shared/versionDiffs"
import { TranslateCategoryFilter } from "./translate/TranslateCategoryFilter"
import { TranslateRow } from "./translate/TranslateRow"
import {
  buildRows,
  countByCategory,
  countUntranslated,
  filterRows,
  isBaseLanguage,
  patchEntries,
  resolveLanguages,
} from "./translate/translateState"
import type { StepProps } from "./shared/types"

const ROW_ESTIMATE = 96
const NO_ENTRIES: TextCatalogEntry[] = []

function languageName(code: string, locale: string): string {
  if (!code) return ""
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

export function TranslateStep(props: StepProps) {
  const { label, plugin } = props
  const { t, i18n } = useLingui()
  const query = useTextCatalog(label)
  const config = useActiveConfig(label)
  const book = useBook(label)

  const catalog = query.data

  const { languages, baseLanguage } = useMemo(() => {
    const merged = config.data?.merged as Record<string, unknown> | undefined
    return resolveLanguages({
      configuredOutputs: merged?.output_languages as string[] | undefined,
      editingLanguage: merged?.editing_language as string | undefined,
      bookLanguage: book.data?.languageCode ?? book.data?.metadata?.language_code ?? null,
      translationCodes: Object.keys(catalog?.translations ?? {}),
    })
  }, [config.data, book.data, catalog])

  const [active, setActive] = useState<string | null>(null)
  const [category, setCategory] = useState<CatalogCategory>("all")
  const [search, setSearch] = useState("")
  const [lightbox, setLightbox] = useState<string | null>(null)

  const language = active ?? languages[0] ?? ""
  const isBase = isBaseLanguage(language, baseLanguage)
  const save = useSaveTranslation(label, language)

  const rows = useMemo(() => buildRows(catalog, language, isBase), [catalog, language, isBase])
  const categoryCounts = useMemo(() => countByCategory(rows), [rows])
  const untranslated = useMemo(() => (isBase ? 0 : countUntranslated(rows)), [rows, isBase])
  const shown = useMemo(() => filterRows(rows, category, search), [rows, category, search])

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: shown.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 6,
    getItemKey: (index) => shown[index]?.id ?? index,
  })

  // The catalog is the source of truth for both modes: the base language writes
  // back the source entries, a translation writes back its own — appending the
  // row when the translation never held one, which is what makes an
  // untranslated row editable at all.
  const saveRow = useCallback(
    (id: string, text: string) => {
      const current = isBase
        ? catalog?.entries ?? NO_ENTRIES
        : catalog?.translations[language]?.entries ?? NO_ENTRIES
      save.mutate({ entries: patchEntries(current, id, text) })
    },
    [catalog, language, isBase, save],
  )

  const openImage = useCallback((src: string) => setLightbox(src), [])

  const versionDiff = useMemo(() => {
    const sourceById = new Map((catalog?.entries ?? []).map((entry) => [entry.id, entry.text]))
    return translationVersionDiff(t, sourceById)
  }, [catalog, t])

  const loading = useStepLoading(props, {
    isLoading: query.isLoading,
    hasOutput: (catalog?.entries.length ?? 0) > 0,
  })
  if (loading) return <StepLoading {...props} />
  if (!catalog || catalog.entries.length === 0) return <StepEmpty {...props} />

  const version = isBase ? catalog.version : catalog.translations[language]?.version ?? null
  const total = catalog.entries.length

  return (
    <StepShell
      {...props}
      chips={[
        t`${total} strings`,
        t`${languages.length} languages`,
        ...(untranslated > 0 ? [t`${untranslated} untranslated`] : []),
      ]}
      headerExtra={
        <StepVersionPicker
          label={label}
          step="text-catalog-translation"
          itemId={language}
          currentVersion={version}
          isSaving={save.isPending}
          diff={versionDiff}
        />
      }
      canApply={total > 0}
      bodyViewportClassName={STEP_FILL_VIEWPORT_CLASSNAME}
      rail={
        <StepRail
          heading={<Trans>Output languages</Trans>}
          hex={plugin.hex}
          entries={languages.map((code) => ({
            key: code,
            title: languageName(code, i18n.locale),
            subtitle: isBaseLanguage(code, baseLanguage) ? t`Book language` : code,
            count: isBaseLanguage(code, baseLanguage)
              ? total
              : catalog.translations[code]?.entries.length ?? 0,
          }))}
          activeKey={language}
          onSelect={(key) => {
            setActive(key)
            setCategory("all")
            setSearch("")
          }}
          footer={<Trans>{total} source strings in the catalog.</Trans>}
        />
      }
    >
      <StepScrollBody
        viewportRef={scrollRef}
        title={isBase ? <Trans>Source text</Trans> : <Trans>Translation</Trans>}
        meta={
          isBase
            ? t`${languageName(language, i18n.locale)} · book language`
            : t`${languageName(baseLanguage, i18n.locale)} to ${languageName(language, i18n.locale)}`
        }
        actions={
          <Input
            wrapperClassName="w-[240px]"
            className="h-8"
            prependIcon={<Search className="size-3.5" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t`Search id, source or translation…`}
          />
        }
        toolbar={
          <>
            <TranslateCategoryFilter
              counts={categoryCounts}
              total={rows.length}
              active={category}
              hex={plugin.hex}
              onSelect={setCategory}
            />
            <SaveError error={save.error} />
          </>
        }
      >
        {shown.length === 0 ? (
          <StepEmptyHint>
            <Trans>No strings match this filter.</Trans>
          </StepEmptyHint>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = shown[virtualRow.index]
              return (
                <div
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="pb-2"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <TranslateRow
                    row={row}
                    label={label}
                    hex={plugin.hex}
                    language={language}
                    isBase={isBase}
                    isSaving={save.isPending}
                    onSave={saveRow}
                    onOpenImage={openImage}
                  />
                </div>
              )
            })}
          </div>
        )}
      </StepScrollBody>

      {lightbox ? <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} /> : null}
    </StepShell>
  )
}
