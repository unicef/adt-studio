import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { Loader2, BookOpen, Sparkles, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useBook } from "@/hooks/use-books"
import { useBookConfig } from "@/hooks/use-book-config"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { useSourcePdfInfo } from "@/hooks/use-source-pdf-info"
import { usePartInfo } from "@/hooks/use-parts"
import { usePages } from "@/hooks/use-pages"
import { useStageStatus } from "@/hooks/use-stage-status"
import { SpreadPickerDialog } from "@/components/spread-picker/SpreadPickerDialog"
import { normalizeLeads } from "@/components/spread-picker/pairs"
import { getSourcePdfUrl, api } from "@/api/client"

/**
 * Post-extraction spread review. Extraction runs on single pages first and
 * detects likely spreads inline; the user confirms the auto-detected pairs (or
 * marks their own), and each accepted pair is merged incrementally — no full
 * re-extract. Single-base, non-part books only.
 */
export function SpreadReview({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { data: book } = useBook(bookLabel)
  const { data: sourcePdfInfo } = useSourcePdfInfo(bookLabel)
  const { data: partInfo } = usePartInfo(bookLabel)
  const { data: pages } = usePages(bookLabel)
  const extractRunning = useStageStatus("extract").isRunning
  const queryClient = useQueryClient()

  const singleBase = !!bookConfigData?.config && bookConfigData.config.spread_mode !== true
  const { data: suggestionData } = useQuery({
    queryKey: ["books", bookLabel, "spread-suggestions"],
    queryFn: () => api.getSpreadSuggestions(bookLabel),
    enabled: singleBase,
  })

  const config = bookConfigData?.config
  const [spreadPairs, setSpreadPairs] = useState<number[]>([])
  const [open, setOpen] = useState(false)
  const [pickerView, setPickerView] = useState<"all" | "spreads">("all")
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())

  const applyMutation = useMutation({
    mutationFn: (pairs: number[]) => api.applySpreads(bookLabel, pairs),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] }),
  })

  useEffect(() => {
    if (!config) return
    setSpreadPairs(Array.isArray(config.spread_pairs) ? config.spread_pairs.map(Number) : [])
  }, [config])

  // Re-detection runs inline during extraction, so refresh suggestions once a
  // (re-)extract finishes — otherwise the confirm card shows stale results.
  const prevRunning = useRef(extractRunning)
  useEffect(() => {
    if (prevRunning.current && !extractRunning) {
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "spread-suggestions"] })
    }
    prevRunning.current = extractRunning
  }, [extractRunning, bookLabel, queryClient])

  const isPart = !!partInfo
  const totalPages = sourcePdfInfo?.pageCount ?? book?.pageCount ?? 0
  const startPage = config?.start_page != null ? Number(config.start_page) : 1
  const endPage =
    config?.end_page != null ? Number(config.end_page) : Math.max(startPage, totalPages || 1)

  if (!config || !singleBase || isPart || totalPages === 0) return null

  const markedPairs = normalizeLeads(spreadPairs, startPage, endPage)
  const markedSpreads = markedPairs.length

  // What's actually merged in the extracted pages right now (ids like pgLLLRRR),
  // so we can tell an applied spread from one that's still pending.
  const appliedLeads = new Set<number>()
  for (const p of pages ?? []) {
    const m = /^pg(\d{3})(\d{3})$/.exec(p.pageId)
    if (m) appliedLeads.add(Number(m[1]))
  }
  const mergedCount = appliedLeads.size
  const markedSet = new Set(markedPairs)
  const pending =
    markedPairs.some((l) => !appliedLeads.has(l)) ||
    [...appliedLeads].some((l) => !markedSet.has(l))

  // Auto-detected pairs the user hasn't acted on yet (not merged, not already
  // marked, not dismissed this session).
  const toConfirm = (suggestionData?.suggestions ?? [])
    .filter(
      (s) => !appliedLeads.has(s.lead) && !markedSet.has(s.lead) && !dismissed.has(s.lead),
    )
    .sort((a, b) => a.lead - b.lead)
  const selectedLeads = toConfirm.map((s) => s.lead).filter((l) => !excluded.has(l))
  const confirmCount = toConfirm.length
  const selectedCount = selectedLeads.length

  const suggestedLeads = (suggestionData?.suggestions ?? []).map((s) => s.lead)

  const applyChange = (next: number[]) => {
    setSpreadPairs(next)
    persist({ spread_pairs: next })
  }

  const openPicker = (initial: "all" | "spreads") => {
    setPickerView(initial)
    setOpen(true)
  }

  const reviewSelected = () => {
    if (selectedLeads.length === 0) return
    applyChange(normalizeLeads([...spreadPairs, ...selectedLeads], startPage, endPage))
    openPicker("spreads")
  }

  const toggle = (lead: number) =>
    setExcluded((prev) => {
      const nextSet = new Set(prev)
      if (nextSet.has(lead)) nextSet.delete(lead)
      else nextSet.add(lead)
      return nextSet
    })

  const dismissAll = () =>
    setDismissed((prev) => new Set([...prev, ...toConfirm.map((s) => s.lead)]))

  return (
    <div
      aria-busy={extractRunning}
      className={cn(
        "mb-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 transition-opacity",
        extractRunning && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-[13px] font-medium text-foreground">{t`Two-page spreads`}</p>
            <p className="max-w-[640px] text-xs leading-relaxed text-muted-foreground">
              {t`These pages were extracted one at a time. If an illustration runs across two facing pages, merge those pairs so they're kept together.`}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openPicker("all")}
          disabled={extractRunning}
        >
          {markedSpreads === 0 ? t`Mark spreads` : t`Edit spreads`}
        </Button>
      </div>

      {extractRunning && (
        <p className="pl-[38px] text-[12px] text-muted-foreground">
          {t`Extraction is running — you can review spreads once it finishes.`}
        </p>
      )}

      {toConfirm.length > 0 && (
        <div className="ml-[38px] flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-blue-800">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t`Detected ${confirmCount} possible {confirmCount, plural, one {spread} other {spreads}} — confirm which to merge`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {toConfirm.map((s) => {
              const on = !excluded.has(s.lead)
              return (
                <button
                  key={s.lead}
                  type="button"
                  onClick={() => toggle(s.lead)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors",
                    on
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-blue-200 bg-white text-blue-700",
                  )}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                  {s.lead}–{s.lead + 1}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={reviewSelected}
              disabled={selectedCount === 0 || extractRunning}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {t`Review ${selectedCount} selected`}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={dismissAll}>
              {t`Dismiss`}
            </Button>
          </div>
        </div>
      )}

      {pending && (
        <div className="flex flex-wrap items-center gap-2 pl-[38px]">
          <div className="flex flex-wrap gap-1.5">
            {markedPairs.map((lead) => (
              <span
                key={lead}
                className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-blue-700"
              >
                {lead}–{lead + 1}
              </span>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => applyMutation.mutate(markedPairs)}
            disabled={applyMutation.isPending || extractRunning}
            className="ml-auto bg-blue-600 hover:bg-blue-700"
          >
            {applyMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                {t`Applying…`}
              </>
            ) : (
              t`Apply spreads`
            )}
          </Button>
        </div>
      )}
      {!pending && mergedCount > 0 && (
        <p className="pl-[38px] text-[12px] text-muted-foreground">
          {t`${mergedCount} {mergedCount, plural, one {spread} other {spreads}} merged.`}
        </p>
      )}

      {applyMutation.isError && (
        <p className="pl-[38px] text-[12px] text-red-600">
          {t`Couldn't apply the spreads — please try again.`}
        </p>
      )}

      <SpreadPickerDialog
        open={open}
        onOpenChange={setOpen}
        src={getSourcePdfUrl(bookLabel)}
        startPage={startPage}
        endPage={endPage}
        spreadPairs={spreadPairs}
        onChange={applyChange}
        suggestedLeads={suggestedLeads}
        defaultView={pickerView}
      />
    </div>
  )
}
