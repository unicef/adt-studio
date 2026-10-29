import { Suspense, lazy, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
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
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { STAGES } from "@/components/pipeline/stage-config"
import { getSourcePdfUrl, api } from "@/api/client"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

const EXTRACT_HEX = STAGES.find((stage) => stage.slug === "extract")?.hex

const SpreadPickerDialog = lazy(() =>
  import("@/components/spread-picker/SpreadPickerDialog").then((m) => ({
    default: m.SpreadPickerDialog,
  })),
)

const MERGED_PAGE_ID = /^pg(\d{3})(\d{3})$/

const NO_LEADS: ReadonlySet<number> = new Set()
const dismissedByBook = new Map<string, ReadonlySet<number>>()
const dismissedListeners = new Set<() => void>()

function subscribeDismissed(listener: () => void) {
  dismissedListeners.add(listener)
  return () => dismissedListeners.delete(listener)
}

function useDismissedLeads(label: string): [ReadonlySet<number>, (leads: number[]) => void] {
  const dismissed = useSyncExternalStore(subscribeDismissed, () => dismissedByBook.get(label) ?? NO_LEADS)
  const dismiss = useCallback(
    (leads: number[]) => {
      dismissedByBook.set(label, new Set([...(dismissedByBook.get(label) ?? NO_LEADS), ...leads]))
      for (const listener of dismissedListeners) listener()
    },
    [label],
  )
  return [dismissed, dismiss]
}

export interface SpreadReview {
  eligible: boolean
  extractRunning: boolean
  confirmCount: number
  mergedCount: number
  pendingLeads: number[]
  toConfirm: { lead: number }[]
  detected: boolean
  applying: boolean
  applyFailed: boolean
  retryApply: () => void
  openPicker: (initial: "all" | "spreads", selection?: number[]) => void
  dismissAll: () => void
  picker: ReactNode
}

export function useSpreadReview(label: string, pages: PipelinePage[]): SpreadReview {
  const extractRunning = useStageStatus("extract").isRunning
  const { data: bookConfigData } = useBookConfig(label)
  const persist = usePersistConfig(label)
  const { data: book } = useBook(label)
  const { data: sourcePdfInfo } = useSourcePdfInfo(label)
  const { data: partInfo } = usePartInfo(label)
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
  const [dismissed, dismissLeads] = useDismissedLeads(label)

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

  const mergedCount = appliedLeads.size
  const confirmCount = toConfirm.length
  const suggestedLeads = (suggestionData?.suggestions ?? []).map((s) => s.lead)
  const pendingLeads = toConfirm.map((s) => s.lead)

  const commitAndMerge = (next: number[]) => {
    persist({ spread_pairs: next })
    applyMutation.mutate(next)
    if (pickerSelection.length > 0) {
      dismissLeads(pickerSelection)
    }
  }

  const openPicker = (initial: "all" | "spreads", selection: number[] = []) => {
    setPickerView(initial)
    setPickerSelection(selection)
    setHasOpened(true)
    setOpen(true)
  }

  const dismissAll = () => dismissLeads(pendingLeads)

  const detected = confirmCount > 0 || mergedCount > 0 || applyMutation.isPending

  const picker = hasOpened && (
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
        accent={EXTRACT_HEX}
      />
    </Suspense>
  )

  return {
    eligible: !!config && singleBase && !isPart && totalPages > 0,
    extractRunning,
    confirmCount,
    mergedCount,
    pendingLeads,
    toConfirm,
    detected,
    applying: applyMutation.isPending,
    applyFailed: applyMutation.isError,
    retryApply: () => {
      if (applyMutation.variables) applyMutation.mutate(applyMutation.variables)
    },
    openPicker,
    dismissAll,
    picker,
  }
}
