import { useMemo, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { ChevronRight, Loader2, Search, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { api, type PageDetail } from "@/api/client"
import { cn } from "@/lib/utils"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import {
  matchesDecorativeFilter,
  matchesSearch,
} from "@/components/pipeline/stages/captions/lib/utils"
import type { DecorativeFilter } from "@/components/pipeline/stages/captions/lib/types"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { StepEmptyHint } from "../shared/ui"
import { CaptionCardsView } from "./CaptionCardsView"
import { CaptionsVersionPicker } from "./CaptionsVersionPicker"
import { useCaptionEdits } from "./useCaptionEdits"

export function CaptionsAllImages({
  label,
  pages,
  accent,
  onOpenPage,
}: {
  label: string
  pages: PipelinePage[]
  accent: string
  onOpenPage: (pageId: string) => void
}) {
  const { t } = useLingui()
  const [filter, setFilter] = useState<DecorativeFilter>("all")
  const [search, setSearch] = useState("")

  const details = useQueries({
    queries: pages.map((page) => ({
      queryKey: ["books", label, "pages", page.pageId],
      queryFn: () => api.getPage(label, page.pageId),
    })),
  })

  const detailsLoading = details.some((query) => query.isLoading)

  const counts = useMemo(() => {
    let all = 0
    let decorative = 0
    for (const query of details) {
      for (const cap of query.data?.imageCaptioning?.captions ?? []) {
        all += 1
        if (cap.decorative === true) decorative += 1
      }
    }
    return { all, captioned: all - decorative, decorative }
  }, [details])

  const visibleTotal = useMemo(() => {
    let n = 0
    for (const query of details) {
      for (const cap of query.data?.imageCaptioning?.captions ?? []) {
        if (matchesDecorativeFilter(cap, filter) && matchesSearch(cap, search)) n += 1
      }
    }
    return n
  }, [details, filter, search])

  const filtersActive = filter !== "all" || search.trim().length > 0

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

        {detailsLoading && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
            <Trans>Loading pages…</Trans>
          </span>
        )}
      </div>

      {filtersActive && !detailsLoading && visibleTotal === 0 ? (
        <StepEmptyHint>
          <span className="flex flex-col items-center gap-2">
            {search.trim() ? (
              <Trans>No captions match your search.</Trans>
            ) : (
              <Trans>No captions match these filters.</Trans>
            )}
            <button
              type="button"
              onClick={() => {
                setFilter("all")
                setSearch("")
              }}
              className="font-medium underline-offset-2 hover:underline"
              style={{ color: accent }}
            >
              <Trans>Clear filters</Trans>
            </button>
          </span>
        </StepEmptyHint>
      ) : (
        pages.map((page, index) => {
          const detail = details[index]?.data
          if (!detail) return null
          return (
            <CaptionsPageSection
              key={page.pageId}
              label={label}
              pageNumber={page.pageNumber}
              detail={detail}
              accent={accent}
              filter={filter}
              search={search}
              onOpen={onOpenPage}
            />
          )
        })
      )}
    </>
  )
}

function CaptionsPageSection({
  label,
  pageNumber,
  detail,
  accent,
  filter,
  search,
  onOpen,
}: {
  label: string
  pageNumber: number
  detail: PageDetail
  accent: string
  filter: DecorativeFilter
  search: string
  onOpen: (pageId: string) => void
}) {
  const { t } = useLingui()
  const pageId = detail.pageId
  const edits = useCaptionEdits(label, pageId, detail)

  const anyVisible = useMemo(
    () =>
      edits.captions.some(
        (c) => matchesDecorativeFilter(c, filter) && matchesSearch(c, search),
      ),
    [edits.captions, filter, search],
  )

  if (edits.captions.length === 0 || !anyVisible) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3 border-b pb-2">
        <PageThumb label={label} pageId={pageId} sectionIndex={null} className="h-14 w-11" />
        <button
          type="button"
          onClick={() => onOpen(pageId)}
          title={t`Open page ${pageNumber}`}
          className="group flex items-center gap-1.5 text-[13px] font-semibold text-foreground transition-colors hover:text-foreground/80"
        >
          <Trans>Page {pageNumber}</Trans>
          <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {t`${edits.captions.length} images`}
        </span>
        <div className="ml-auto">
          <CaptionsVersionPicker
            label={label}
            pageId={pageId}
            pageNumber={pageNumber}
            currentVersion={detail.versions.imageCaptioning}
            edits={edits}
          />
        </div>
      </div>
      <CaptionCardsView
        label={label}
        pageId={pageId}
        page={detail}
        accent={accent}
        edits={edits}
        filter={filter}
        search={search}
      />
    </section>
  )
}
