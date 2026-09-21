import { useState } from "react"
import { ChevronLeft, ChevronRight, LayoutGrid, Loader2, Search, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PageDetail } from "@/api/client"
import { cn } from "@/lib/utils"
import { usePage } from "@/hooks/use-pages"
import type { DecorativeFilter } from "@/components/pipeline/stages/captions/lib/types"
import { DetailNavButton, StepBody, StepEmptyHint } from "../shared/ui"
import { usePrefetchAdjacentPages } from "../shared/usePrefetchAdjacentPages"
import { CaptionCardsView } from "./CaptionCardsView"
import { CaptionsVersionPicker } from "./CaptionsVersionPicker"
import { useCaptionEdits } from "./useCaptionEdits"

export function CaptionsPageDetail({
  label,
  pageId,
  accent,
  prevPageId,
  nextPageId,
  onStep,
  onClose,
}: {
  label: string
  pageId: string
  accent: string
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
}) {
  const { t } = useLingui()
  const { data: page, isLoading } = usePage(label, pageId)
  usePrefetchAdjacentPages(label, prevPageId, nextPageId)

  return (
    <StepBody
      title={page ? <Trans>Page {page.pageNumber}</Trans> : <Trans>Page</Trans>}
      meta={pageId}
      actions={
        <>
          <DetailNavButton
            icon={ChevronLeft}
            label={t`Previous page`}
            onClick={() => prevPageId && onStep(prevPageId)}
            disabled={!prevPageId}
          />
          <DetailNavButton
            icon={ChevronRight}
            label={t`Next page`}
            onClick={() => nextPageId && onStep(nextPageId)}
            disabled={!nextPageId}
          />
          <DetailNavButton icon={LayoutGrid} label={t`All pages`} onClick={onClose}>
            <Trans>All pages</Trans>
          </DetailNavButton>
        </>
      }
    >
      {isLoading || !page ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          <Trans>Loading page…</Trans>
        </div>
      ) : !page.imageCaptioning || page.imageCaptioning.captions.length === 0 ? (
        <StepEmptyHint>
          <Trans>This page has no captioned images yet.</Trans>
        </StepEmptyHint>
      ) : (
        <CaptionsEditor label={label} pageId={pageId} page={page} accent={accent} />
      )}
    </StepBody>
  )
}

function CaptionsEditor({
  label,
  pageId,
  page,
  accent,
}: {
  label: string
  pageId: string
  page: PageDetail
  accent: string
}) {
  const { t } = useLingui()
  const edits = useCaptionEdits(label, pageId, page)

  const [filter, setFilter] = useState<DecorativeFilter>("all")
  const [search, setSearch] = useState("")

  let decorative = 0
  for (const c of edits.captions) if (c.decorative === true) decorative += 1
  const counts = {
    all: edits.captions.length,
    captioned: edits.captions.length - decorative,
    decorative,
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
          {(
            [
              { value: "all", label: t`All`, count: counts.all },
              { value: "captioned", label: t`Captioned`, count: counts.captioned },
              { value: "decorative", label: t`Decorative`, count: counts.decorative },
            ] as const
          ).map((option) => {
            const active = filter === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{option.label}</span>
                <span
                  className="tabular-nums text-[11px]"
                  style={active ? { color: accent } : undefined}
                >
                  {option.count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t`Search captions or image IDs…`}
            className="h-8 w-full rounded-md border bg-background pl-8 pr-8 text-[12px] placeholder:text-muted-foreground/60 focus:border-brand-400 focus:outline-none focus:shadow-[0_0_0_3px_var(--brand-50)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t`Clear search`}
              className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <div className="ml-auto">
          <CaptionsVersionPicker
            label={label}
            pageId={pageId}
            pageNumber={page.pageNumber}
            currentVersion={page.versions.imageCaptioning}
            edits={edits}
          />
        </div>
      </div>

      <CaptionCardsView
        label={label}
        pageId={pageId}
        page={page}
        accent={accent}
        edits={edits}
        filter={filter}
        search={search}
        onClearFilters={() => {
          setFilter("all")
          setSearch("")
        }}
      />
    </>
  )
}
