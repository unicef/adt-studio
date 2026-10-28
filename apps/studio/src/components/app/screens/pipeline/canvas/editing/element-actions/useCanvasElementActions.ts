import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { setLeafRole, toggleNodePruned } from "@adt/types"
import { api, BASE_URL } from "@/api/client"
import { toast } from "@/components/ui/sonner"
import { useApiKey, useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { usePage } from "@/hooks/use-pages"
import { useSectionElementActions } from "@/components/pipeline/stages/storyboard/components/useSectionElementActions"
import { selectedElementInfo, withSectionNodes, type SectioningData } from "@/components/pipeline/stages/storyboard/lib/section-element-edits"
import type { StyleEditorElementProps } from "@/components/pipeline/stages/storyboard/components/style-editor/ElementActions"
import { useCanvasEditing } from "../CanvasEditing"
import type { SectioningTree } from "../sectioningDraft"

function useAiImageRefresh(label: string, pageId: string | null) {
  const queryClient = useQueryClient()
  const { tasks } = useBookTasks(label)
  const [taskId, setTaskId] = useState<string | null>(null)
  const previous = useRef<string | null>(null)
  const task = taskId ? (tasks.find((candidate) => candidate.taskId === taskId) ?? null) : null

  useEffect(() => {
    if (!task) {
      previous.current = null
      return
    }
    const before = previous.current
    previous.current = task.status
    if (before === "completed" || task.status !== "completed") return
    void queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
    setTaskId(null)
  }, [task, task?.status, label, pageId, queryClient])

  return setTaskId
}

export function useCanvasElementActions(label: string, remove: (dataId: string) => void) {
  const { selection, pageId, locked, sectionHtml, recordEdit, pendingSectioning, updateSectioning, select } = useCanvasEditing()
  const page = usePage(label, pageId ?? "")
  const { apiKey, hasImageProvider } = useApiKey()
  const hasStructuredTextProvider = useBookStructuredTextAvailability(label)
  const { stageState } = useBookRun()
  const storyboardRunning = stageState("storyboard") === "running" || stageState("storyboard") === "queued"
  const config = useQuery({
    queryKey: ["books", label, "config", "active"],
    queryFn: () => api.getActiveConfig(label),
    staleTime: 5 * 60 * 1000,
  })
  const textTypes = config.data?.merged?.role_types as Record<string, string> | undefined
  const trackAiImage = useAiImageRefresh(label, pageId)
  const sectionIndex = selection?.sectionIndex ?? 0
  const tree = (pendingSectioning ?? page.data?.sectioningTree ?? null) as SectioningData | null
  const nodes = selection ? (tree?.sections[selection.sectionIndex]?.nodes ?? null) : null

  const editNodes = (dataId: string, edit: (nodes: SectioningData["sections"][number]["nodes"]) => SectioningData["sections"][number]["nodes"]) =>
    updateSectioning((base) => {
      const sectioning = base as SectioningData
      const target = sectioning.sections[sectionIndex]
      if (!target) return base
      const nextNodes = edit(target.nodes)
      return nextNodes === target.nodes ? base : (withSectionNodes(sectioning, sectionIndex, nextNodes) as SectioningTree)
    })

  const actions = useSectionElementActions({
    bookLabel: label,
    pageId: pageId ?? "",
    sectionIndex,
    imagesMeta: page.data?.imagesMeta ?? [],
    apiKey,
    storyboardRunning: storyboardRunning || locked,
    hasImageProvider,
    hasStructuredTextProvider,
    updateSectioning: (updater) => updateSectioning((base) => updater(base as SectioningData) as SectioningTree),
    updateSectionHtml: (updater) => {
      const html = sectionHtml(sectionIndex)
      if (html != null) recordEdit(sectionIndex, updater(html), { reload: true })
    },
    onError: (message) => toast.error(message),
    onCropped: () => select(null),
    onAiImageSubmitted: (taskId) => trackAiImage(taskId),
    toggleLeafPruned: (dataId) => editNodes(dataId, (current) => toggleNodePruned(current, dataId)),
    setLeafRole: (dataId, role) => editNodes(dataId, (current) => setLeafRole(current, dataId, role)),
    deleteElement: remove,
  })

  const info = selection && tree ? selectedElementInfo(selection, nodes, (id) => `${BASE_URL}/books/${label}/images/${id}`) : null
  const elementProps: StyleEditorElementProps | null = info ? { ...actions.elementProps(info), textTypes } : null
  const panelProps: { elementProps?: StyleEditorElementProps | null } = elementProps ? { elementProps } : {}
  return { elementProps, panelProps, actions }
}
