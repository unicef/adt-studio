import { useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Columns2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CatalogCategory } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import { ListToolbar } from "../shared/list/ListToolbar"
import { PageJumpInput } from "../shared/list/PageJumpInput"
import { StepFilterTabs, type StepFilterOption } from "../shared/StepFilterTabs"
import type { ClipFilter, SpeechCounts, VoiceSlot } from "./speechRows"
import { useClipLabels } from "./useClipLabels"
import type { VoiceSlots } from "./useVoiceSlots"

const CATEGORY_ORDER: CatalogCategory[] = ["all", "text", "captions", "answers", "glossary", "easy-read"]

export interface SpeechPageOption {
  pageId: string
  pageNumber: number
}

export function SpeechToolbar({
  hex,
  counts,
  categories,
  clip,
  onClip,
  category,
  onCategory,
  voices,
  slot,
  onSlot,
  compare,
  onCompare,
  baseLanguageName,
  showCompare,
  pages,
  page,
  onPage,
  shown,
}: {
  hex: string
  counts: SpeechCounts
  categories: ReadonlyMap<CatalogCategory, number>
  clip: ClipFilter
  onClip: (value: ClipFilter) => void
  category: CatalogCategory
  onCategory: (value: CatalogCategory) => void
  voices: VoiceSlots
  slot: VoiceSlot
  onSlot: (value: VoiceSlot) => void
  compare: boolean
  onCompare: (value: boolean) => void
  baseLanguageName: string
  showCompare: boolean
  pages: readonly SpeechPageOption[]
  page: SpeechPageOption | null
  onPage: (pageId: string | null) => void
  shown: number
}) {
  const { t } = useLingui()
  const labels = useClipLabels()

  const clipOptions = useMemo(() => {
    const list: StepFilterOption<ClipFilter>[] = [
      { value: "all", label: t`All`, count: counts.total },
      { value: "missing", label: t`No audio`, count: counts.missing + counts.waiting },
    ]
    if (counts.failed > 0 || clip === "failed") list.push({ value: "failed", label: t`Failed`, count: counts.failed, tone: "danger" })
    list.push({ value: "muted", label: t`Not read aloud`, count: counts.muted })
    return list
  }, [t, counts, clip])

  const categoryOptions = useMemo(
    () =>
      CATEGORY_ORDER.filter((key) => key === "all" || (categories.get(key) ?? 0) > 0).map((key) => ({
        value: key,
        label: labels.category(key),
        count: categories.get(key) ?? 0,
      })),
    [categories, labels],
  )

  const slotOptions = useMemo(
    () => [
      { value: "primary" as const, label: voices.primary.name ? t`Main · ${voices.primary.name}` : t`Main voice` },
      { value: "secondary" as const, label: voices.secondary.name ? t`Second · ${voices.secondary.name}` : t`Second voice` },
    ],
    [t, voices],
  )

  return (
    <ListToolbar
      left={
        <>
          <StepFilterTabs ariaLabel={t`Show clips`} accent={hex} value={clip} onChange={onClip} options={clipOptions} />
          {categoryOptions.length > 2 && (
            <StepFilterTabs ariaLabel={t`Show text type`} accent={hex} value={category} onChange={onCategory} options={categoryOptions} />
          )}
          {voices.hasSecondary && <StepFilterTabs ariaLabel={t`Narrator voice`} accent={hex} value={slot} onChange={onSlot} options={slotOptions} />}
        </>
      }
      right={
        <>
          {showCompare && (
            <button
              type="button"
              aria-pressed={compare}
              onClick={() => onCompare(!compare)}
              style={{ ["--compare-accent" as string]: hex }}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-[10px] border px-2.5 text-[12px] font-medium transition-[background-color,color,border-color] duration-200 motion-reduce:transition-none",
                "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--compare-accent)_45%,transparent)]",
                compare
                  ? "border-[color-mix(in_srgb,var(--compare-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--compare-accent)_10%,transparent)] text-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Columns2 className="size-3.5" />
              {t`Show ${baseLanguageName}`}
            </button>
          )}
          {page ? (
            <button
              type="button"
              onClick={() => onPage(null)}
              aria-label={t`Show every page`}
              className="flex h-9 items-center gap-1.5 rounded-[10px] border bg-card pr-2 pl-3 text-[12px] font-medium text-foreground transition-colors hover:bg-muted animate-in fade-in duration-150 motion-reduce:animate-none"
            >
              {t`Page ${page.pageNumber}`}
              <X className="size-3.5 text-muted-foreground" />
            </button>
          ) : (
            pages.length > 0 && <PageJumpInput pages={pages} onJump={(target) => onPage(target.pageId)} />
          )}
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {t`${plural(shown, { one: "# clip", other: "# clips" })}`}
          </span>
        </>
      }
    />
  )
}
