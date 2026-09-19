import { useCallback, useMemo, useState } from "react"
import { BASE_URL } from "@/api/client"
import { usePage } from "@/hooks/use-pages"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { clearDrafts, getDrafts, setDraft as writeDraft } from "./draftStore"
import {
  editorStatus,
  toEditorSections,
  type EditorSection,
  type EditorStatus,
} from "./editorSections"
import { applyDrafts, hasDrafts, imageUrlCodec } from "./renderingDraft"
import { useSaveRendering } from "./useSaveRendering"

export type { EditorSection, EditorStatus }

export interface StoryboardEditorSession {
  pageId: string | null
  status: EditorStatus
  error: Error | null
  sections: EditorSection[]
  activeSection: EditorSection | null
  selectSection: (pageId: string, sectionIndex: number) => void
  setDraft: (sectionIndex: number, html: string) => void
  saving: boolean
  save: () => Promise<void>
  discard: () => void
}

export interface StoryboardEditorOptions {
  label: string
  page: PipelinePage | null
  enabled: boolean
}

export function useStoryboardEditor({
  label,
  page,
  enabled,
}: StoryboardEditorOptions): StoryboardEditorSession {
  const pageId = enabled && page ? page.pageId : null
  const detail = usePage(label, pageId ?? "")
  const { mutateAsync: saveRendering, isPending: saving } = useSaveRendering(label, pageId ?? "")
  const codec = useMemo(() => imageUrlCodec(BASE_URL), [])

  const [requested, setRequested] = useState<{ pageId: string; sectionIndex: number } | null>(null)

  const rendering = enabled ? detail.data?.rendering ?? null : null
  const sections = useMemo(
    () => toEditorSections(page, rendering, codec),
    [page, rendering, codec],
  )

  const activeSection = useMemo(() => {
    const wanted = requested?.pageId === pageId ? requested.sectionIndex : null
    return sections.find((section) => section.sectionIndex === wanted) ?? sections[0] ?? null
  }, [sections, requested, pageId])

  const selectSection = useCallback((forPageId: string, sectionIndex: number) => {
    setRequested({ pageId: forPageId, sectionIndex })
  }, [])

  const setDraft = useCallback(
    (sectionIndex: number, html: string) => {
      const baseline = sections.find((section) => section.sectionIndex === sectionIndex)?.html
      if (!pageId || baseline === undefined) return
      writeDraft(pageId, sectionIndex, html, baseline)
    },
    [pageId, sections],
  )

  const save = useCallback(async () => {
    const drafts = getDrafts(pageId)
    if (!pageId || !rendering || !hasDrafts(drafts)) return
    await saveRendering(applyDrafts(rendering, drafts, codec))
    clearDrafts(pageId)
  }, [pageId, rendering, codec, saveRendering])

  const discard = useCallback(() => {
    if (pageId) clearDrafts(pageId)
  }, [pageId])

  const status = editorStatus({
    pageId,
    loading: detail.isPending,
    error: detail.error,
    sectionCount: sections.length,
  })

  return useMemo(
    () => ({
      pageId,
      status,
      error: detail.error,
      sections,
      activeSection,
      selectSection,
      setDraft,
      saving,
      save,
      discard,
    }),
    [
      pageId,
      status,
      detail.error,
      sections,
      activeSection,
      selectSection,
      setDraft,
      saving,
      save,
      discard,
    ],
  )
}
