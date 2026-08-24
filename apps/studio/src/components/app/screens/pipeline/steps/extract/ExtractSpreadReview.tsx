import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { BookOpen, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useBook } from "@/hooks/use-books"
import { useBookConfig } from "@/hooks/use-book-config"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { useSourcePdfInfo } from "@/hooks/use-source-pdf-info"
import { usePartInfo } from "@/hooks/use-parts"
import { useStageStatus } from "@/hooks/use-stage-status"
import { normalizeLeads } from "@/components/spread-picker/pairs"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { getSourcePdfUrl, api } from "@/api/client"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

const SpreadPickerDialog = lazy(() =>
  import("@/components/spread-picker/SpreadPickerDialog").then((m) => ({
    default: m.SpreadPickerDialog,
  })),
)

const MERGED_PAGE_ID = /^pg(\d{3})(\d{3})$/

export function ExtractSpreadReview({
  label,
  pages,
  accent,
}: {
  label: string
  pages: PipelinePage[]
  accent: string
}) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(label)
  const persist = usePersistConfig(label)
  const { data: book } = useBook(label)
  const { data: sourcePdfInfo } = useSourcePdfInfo(label)
  const { data: partInfo } = usePartInfo(label)
  const extractRunning = useStageStatus("extract").isRunning
  const queryClient = useQueryClient()

  const config = bookConfigData?.config
  const singleBase = !!config && config.spread_mode !== true

  const { data: suggestionData } = useQuery({
    queryKey: ["books", label, "spread-suggestions"],
    queryFn: () => api.getSpreadSuggestions(label),
    enabled: singleBase,
  })

  const [hasOpened, setHasOpened] = useState(false)
  const [open, setOpen] = useState(false)
  const [pickerView, setPickerView] = useState<"all" | "spreads">("all")
  const [pickerSelection, setPickerSelection] = useState<number[]>([])
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())

  const applyMutation = useMutation({
    mutationFn: (pairs: number[]) => api.applySpreads(label, pairs),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] }),
  })

  const prevRunning = useRef(extractRunning)
  useEffect(() => {
    if (prevRunning.current && !extractRunning) {
      void queryClient.invalidateQueries({ queryKey: ["books", label, "spread-suggestions"] })
    }
    prevRunning.current = extractRunning
  }, [extractRunning, label, queryClient])

  const isPart = !!partInfo
  const totalPages = sourcePdfInfo?.pageCount ?? book?.pageCount ?? 0
  const startPage = config?.start_page != null ? Number(config.start_page) : 1
  const endPage =
    config?.end_page != null ? Number(config.end_page) : Math.max(startPage, totalPages || 1)

  const spreadPairs = useMemo(
    () => (Array.isArray(config?.spread_pairs) ? config.spread_pairs.map(Number) : []),
    [config],
  )

  const appliedLeads = useMemo(() => {
    const leads = new Set<number>()
    for (const page of pages) {
      const match = MERGED_PAGE_ID.exec(page.pageId)
      if (match) leads.add(Number(match[1]))
    }
    return leads
  }, [pages])

  const markedPairs = useMemo(
    () => normalizeLeads(spreadPairs, startPage, endPage),
    [spreadPairs, startPage, endPage],
  )

  const toConfirm = useMemo(() => {
    const markedSet = new Set(markedPairs)
    return (suggestionData?.suggestions ?? [])
      .filter((s) => !appliedLeads.has(s.lead) && !markedSet.has(s.lead) && !dismissed.has(s.lead))
      .sort((a, b) => a.lead - b.lead)
  }, [suggestionData, appliedLeads, markedPairs, dismissed])

  if (!config || !singleBase || isPart || totalPages === 0) return null

  const mergedCount = appliedLeads.size
  const confirmCount = toConfirm.length
  const suggestedLeads = (suggestionData?.suggestions ?? []).map((s) => s.lead)
  const pendingLeads = toConfirm.map((s) => s.lead)

  const commitAndMerge = (next: number[]) => {
    persist({ spread_pairs: next })
    applyMutation.mutate(next)
    if (pickerSelection.length > 0) {
      setDismissed((prev) => new Set([...prev, ...pickerSelection]))
    }
  }

  const openPicker = (initial: "all" | "spreads", selection: number[] = []) => {
    setPickerView(initial)
    setPickerSelection(selection)
    setHasOpened(true)
    setOpen(true)
  }

  const dismissAll = () => setDismissed((prev) => new Set([...prev, ...pendingLeads]))

  return (
    <div
      aria-busy={extractRunning}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 transition-opacity",
        extractRunning && "pointer-events-none opacity-60",
      )}
      style={{ borderColor: tint(accent, 0.3) }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div
            className="mt-px flex size-7 shrink-0 items-center justify-center rounded-md"
            style={{ background: tint(accent, 0.12), color: accent }}
          >
            <BookOpen className="size-3.5" aria-hidden />
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-[13px] font-medium text-foreground">{t`Two-page spreads`}</p>
            <p className="max-w-[640px] text-[12px] leading-relaxed text-muted-foreground">
              {t`These pages were extracted one at a time. If an illustration runs across two facing pages, merge those pairs so they're kept together.`}
            </p>
          </div>
        </div>
        {pendingLeads.length === 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openPicker("all")}
            disabled={extractRunning}
          >
            {mergedCount === 0 ? t`Mark spreads` : t`Edit spreads`}
          </Button>
        )}
      </div>

      {extractRunning && (
        <p className="pl-[38px] text-[12px] text-muted-foreground">
          {t`Extraction is running — you can review spreads once it finishes.`}
        </p>
      )}

      {toConfirm.length > 0 && (
        <div className="ml-[38px] flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
            <Sparkles className="size-3.5" aria-hidden />
            {t`${confirmCount} possible {confirmCount, plural, one {spread} other {spreads}} detected`}
          </div>
          <p className="text-[12px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">
            {t`We compared the page edges and think these facing pages are spreads. Open Review to merge the ones that are — cancelling changes nothing.`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {toConfirm.map((s) => (
              <span
                key={s.lead}
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-amber-800 dark:border-amber-800 dark:bg-transparent dark:text-amber-200"
              >
                <Sparkles className="size-2.5" aria-hidden />
                {s.lead}–{s.lead + 1}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => openPicker("spreads", pendingLeads)}
              disabled={extractRunning}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              <Sparkles className="mr-1.5 size-3.5" aria-hidden />
              {t`Review spreads`}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={dismissAll}>
              {t`Dismiss`}
            </Button>
          </div>
        </div>
      )}

      {applyMutation.isPending ? (
        <p className="flex items-center gap-1.5 pl-[38px] text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          {t`Merging spreads…`}
        </p>
      ) : mergedCount > 0 ? (
        <p className="pl-[38px] text-[12px] text-muted-foreground">
          {t`${mergedCount} {mergedCount, plural, one {spread} other {spreads}} merged.`}
        </p>
      ) : null}

      {applyMutation.isError && (
        <p className="pl-[38px] text-[12px] text-destructive">
          {t`Couldn't apply the spreads — please try again.`}
        </p>
      )}

      {hasOpened && (
        <Suspense fallback={null}>
          <SpreadPickerDialog
            open={open}
            onOpenChange={setOpen}
            src={getSourcePdfUrl(label)}
            startPage={startPage}
            endPage={endPage}
            spreadPairs={spreadPairs}
            onChange={commitAndMerge}
            suggestedLeads={suggestedLeads}
            mergedLeads={[...appliedLeads]}
            initialSelection={pickerSelection}
            defaultView={pickerView}
          />
        </Suspense>
      )}
    </div>
  )
}
