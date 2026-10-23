import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type PageSummarySection } from "@/api/client"
import { GenerateActivityDialog, type ActivityGenMode } from "@/components/pipeline/stages/storyboard/components/GenerateActivityDialog"
import { useApiKey, useBookAgentAvailability } from "@/hooks/use-api-key"
import { bookTasksKey, useBookTasks } from "@/hooks/use-book-tasks"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { scrollBehavior } from "@/lib/utils"
import { useCanvasEditing } from "../editing/CanvasEditing"
import { currentSectionIndex, withPendingPrune } from "../editing/sectioningDraft"
import { createdSectionIndexOf, finishedTasks, isGenerating, staleTaskIds } from "./generateActivity"

export interface CompletionBanner {
  taskId: string
  targetSectionIndex?: number
}

interface StoryboardToolsValue {
  label: string
  page: PipelinePage | null
  sections: PageSummarySection[]
  current: PageSummarySection | null
  currentHasHtml: boolean
  storyboardRunning: boolean
  htmlOpen: boolean
  htmlVisible: boolean
  setHtmlOpen: (open: boolean) => void
  htmlHeight: number
  setHtmlHeight: (height: number) => void
  agentAvailable: boolean
  generating: boolean
  openGenerate: () => void
  banner: CompletionBanner | null
  dismissBanner: () => void
  error: string | null
  dismissError: () => void
  view: (sectionIndex: number) => void
  highlighted: number | null
}

const StoryboardToolsContext = createContext<StoryboardToolsValue | null>(null)

export function useStoryboardTools(): StoryboardToolsValue | null {
  return useContext(StoryboardToolsContext)
}

const BANNER_MS = 10_000
const HIGHLIGHT_MS = 1_800

function defaultHtmlHeight(): number {
  return typeof window === "undefined" ? 280 : Math.max(180, Math.floor(window.innerHeight * 0.3))
}

export function StoryboardToolsProvider({
  label,
  page,
  storyboardRunning,
  children,
}: {
  label: string
  page: PipelinePage | null
  storyboardRunning: boolean
  children: ReactNode
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const editing = useCanvasEditing()
  const { tasks } = useBookTasks(label)
  const agentAvailable = useBookAgentAvailability(label)
  const { apiKey, anthropicKey, googleKey } = useApiKey()
  const [htmlOpen, setHtmlOpen] = useState(false)
  const [htmlHeight, setHtmlHeight] = useState(defaultHtmlHeight)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [banner, setBanner] = useState<CompletionBanner | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const pageId = page?.pageId ?? null

  const sections = useMemo(
    () => withPendingPrune(page?.sections ?? [], editing.pendingSectioning),
    [page?.sections, editing.pendingSectioning],
  )
  const currentIndex = currentSectionIndex(sections, editing.selection?.sectionIndex, editing.focusedSection)
  const current = sections.find((section) => section.sectionIndex === currentIndex) ?? null
  const currentHasHtml = current ? !!editing.sectionHtml(current.sectionIndex) : false
  const generating = isGenerating(tasks, pageId)

  const announced = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (tasks.length === 0 && !announced.current) return
    if (!announced.current) announced.current = new Set(staleTaskIds(tasks, Date.now()))
    const seen = announced.current
    for (const task of finishedTasks(tasks, pageId, "failed", seen)) {
      seen.add(task.taskId)
      setError(task.error ?? t`Agent task failed`)
    }
    for (const task of finishedTasks(tasks, pageId, "completed", seen)) {
      seen.add(task.taskId)
      setBanner({ taskId: task.taskId, targetSectionIndex: createdSectionIndexOf(task.result) })
    }
  }, [tasks, pageId, t])

  useEffect(() => {
    setBanner(null)
    setError(null)
  }, [pageId])

  useEffect(() => {
    if (highlighted === null) return
    const handle = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS)
    return () => clearTimeout(handle)
  }, [highlighted])

  useEffect(() => {
    if (!banner) return
    const handle = setTimeout(() => setBanner(null), BANNER_MS)
    return () => clearTimeout(handle)
  }, [banner])

  const submit = useCallback(
    (description: string, options: { inclusiveDesign: boolean; mode: ActivityGenMode }) => {
      setDialogOpen(false)
      if (!agentAvailable || !pageId) return
      setError(null)
      api
        .agentGenerateActivity(label, pageId, description, apiKey, options, {
          anthropicApiKey: anthropicKey || undefined,
          googleApiKey: googleKey || undefined,
        })
        .then(() => queryClient.invalidateQueries({ queryKey: bookTasksKey(label) }))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : t`Activity generation failed`)
        })
    },
    [agentAvailable, pageId, label, apiKey, anthropicKey, googleKey, queryClient, t],
  )

  const { focusSection } = editing
  const view = useCallback(
    (sectionIndex: number) => {
      focusSection(sectionIndex)
      setHighlighted(sectionIndex)
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-canvas-section="${sectionIndex}"]`)
          ?.scrollIntoView({ behavior: scrollBehavior(), block: "start" })
      })
    },
    [focusSection],
  )

  const value = useMemo<StoryboardToolsValue>(
    () => ({
      label,
      page,
      sections,
      current,
      currentHasHtml,
      storyboardRunning,
      htmlOpen,
      htmlVisible: htmlOpen && currentHasHtml,
      setHtmlOpen,
      htmlHeight,
      setHtmlHeight,
      agentAvailable,
      generating,
      openGenerate: () => setDialogOpen(true),
      banner,
      dismissBanner: () => setBanner(null),
      error,
      dismissError: () => setError(null),
      view,
      highlighted,
    }),
    [label, page, sections, current, currentHasHtml, storyboardRunning, htmlOpen, htmlHeight, agentAvailable, generating, banner, error, view, highlighted],
  )

  return (
    <StoryboardToolsContext value={value}>
      {children}
      {dialogOpen && page && (
        <GenerateActivityDialog
          anchorPageId={page.pageId}
          anchorPageNumber={page.pageNumber}
          onSubmit={submit}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </StoryboardToolsContext>
  )
}
