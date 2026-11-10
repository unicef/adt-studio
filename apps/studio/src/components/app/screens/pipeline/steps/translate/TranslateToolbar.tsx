import { useEffect, useMemo, useRef, useState } from "react"
import { FileText, X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { useVariant } from "@/components/app/lab/variants"
import { cn } from "@/lib/utils"
import type { CatalogCategory } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import { PageJumpInput } from "../shared/list/PageJumpInput"
import { StepFilterTabs, type StepFilterOption } from "../shared/StepFilterTabs"
import { CATEGORY_KEYS } from "./translateState"

export type TranslateView = "all" | "untranslated" | "needs-attention" | "acceptable" | "accepted-anyway"

export interface ViewCounts {
  untranslated: number
  needsAttention: number
  acceptable: number
  acceptedAnyway: number
}

export interface TranslateToolbarProps {
  hex: string
  isBase: boolean
  category: CatalogCategory
  categoryCounts: Map<CatalogCategory, number>
  categoryTotal: number
  onCategory: (category: CatalogCategory) => void
  view: TranslateView
  viewTotal: number
  viewCounts: ViewCounts
  showReview: boolean
  onView: (view: TranslateView) => void
  pages: readonly { pageId: string; pageNumber: number }[]
  pageNumber: number | null
  onPage: (pageId: string | null) => void
  shown: number
  columns: { source: string; target: string } | null
}

export function TranslateToolbar(props: TranslateToolbarProps) {
  const { t } = useLingui()
  const friendly = useVariant("features") === "suggested"
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { threshold: 0 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const categories = useMemo(() => {
    const labels: Record<(typeof CATEGORY_KEYS)[number], string> = {
      text: t`Text`,
      captions: friendly ? t`Image descriptions` : t`Captions`,
      answers: t`Answers`,
      glossary: t`Glossary`,
      "easy-read": t`Easy Read`,
    }
    const out: StepFilterOption<CatalogCategory>[] = [{ value: "all", label: t`All`, count: props.categoryTotal }]
    for (const key of CATEGORY_KEYS) {
      const count = props.categoryCounts.get(key) ?? 0
      if (count === 0 && props.category !== key) continue
      out.push({ value: key, label: labels[key], count })
    }
    return out
  }, [t, friendly, props.categoryCounts, props.categoryTotal, props.category])

  const views = useMemo(() => {
    const { viewCounts: counts, view } = props
    const out: StepFilterOption<TranslateView>[] = [{ value: "all", label: t`All`, count: props.viewTotal }]
    if (counts.untranslated > 0 || view === "untranslated") out.push({ value: "untranslated", label: t`Untranslated`, count: counts.untranslated })
    if (props.showReview) {
      out.push({ value: "needs-attention", label: t`Needs attention`, count: counts.needsAttention })
      out.push({ value: "acceptable", label: t`Reviewed`, count: counts.acceptable })
      if (counts.acceptedAnyway > 0 || view === "accepted-anyway") out.push({ value: "accepted-anyway", label: t`Kept as is`, count: counts.acceptedAnyway })
    }
    return out
  }, [t, props])

  const showViews = !props.isBase && views.length > 1

  return (
    <>
      <div ref={sentinel} aria-hidden className="-mb-3 h-0" />
      <div
        className={cn(
          "sticky top-0 z-10 -mx-1 flex flex-col gap-2 rounded-lg border px-1 py-2 transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none",
          stuck ? "border-border bg-card/95 shadow-sm backdrop-blur" : "border-transparent bg-transparent shadow-none",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StepFilterTabs ariaLabel={t`Show strings of type`} accent={props.hex} value={props.category} onChange={props.onCategory} options={categories} />
          {showViews && <StepFilterTabs ariaLabel={t`Show strings that are`} accent={props.hex} value={props.view} onChange={props.onView} options={views} />}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {props.pageNumber != null ? (
              <span className="flex h-9 items-center gap-1.5 rounded-[10px] border bg-card pl-2.5 pr-1 text-[12px] text-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
                <FileText aria-hidden className="size-3.5 text-muted-foreground" />
                {t`Page ${props.pageNumber}`}
                <button
                  type="button"
                  onClick={() => props.onPage(null)}
                  aria-label={t`Show all translations`}
                  title={t`Show all translations`}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ) : (
              props.pages.length > 1 && <PageJumpInput pages={props.pages} onJump={(page) => props.onPage(page.pageId)} />
            )}
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {t`${plural(props.shown, { one: "# string", other: "# strings" })}`}
            </span>
          </div>
        </div>
        {props.columns && (
          <div aria-hidden className="grid grid-cols-2 gap-4 px-5 text-[11px] font-semibold text-muted-foreground">
            <span className="truncate">{props.columns.source}</span>
            <span className="truncate pl-1.5 text-foreground">
              {props.columns.target}
            </span>
          </div>
        )}
      </div>
    </>
  )
}
