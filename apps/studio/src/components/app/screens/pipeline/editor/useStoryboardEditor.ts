import { useCallback, useMemo, useState } from "react"
import { parseHtml, serializeHtml } from "adt-html-editor"
import { BASE_URL } from "@/api/client"
import { usePage } from "@/hooks/use-pages"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import {
  NO_DRAFTS,
  applyDrafts,
  hasDrafts,
  imageUrlCodec,
  withDraft,
  type SectionDrafts,
} from "./renderingDraft"
import { useSaveRendering } from "./useSaveRendering"

export interface EditorSection {
  sectionIndex: number
  sectionId: string
  isActivity: boolean
  html: string
}

export type EditorStatus = "idle" | "loading" | "error" | "empty" | "ready"

export interface StoryboardEditorSession {
  pageId: string | null
  status: EditorStatus
  error: Error | null
  sections: EditorSection[]
  activeSection: EditorSection | null
  activeHtml: string
  selectSection: (pageId: string, sectionIndex: number) => void
  drafts: SectionDrafts
  setDraft: (sectionIndex: number, html: string) => void
  dirty: boolean
  saving: boolean
  save: () => Promise<void>
  discard: () => void
}

export interface StoryboardEditorOptions {
  label: string
  page: PipelinePage | null
  enabled: boolean
}

interface PageScoped<T> {
  pageId: string
  value: T
}

function scoped<T>(entry: PageScoped<T> | null, pageId: string | null, fallback: T): T {
  return entry && entry.pageId === pageId ? entry.value : fallback
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

  const [requested, setRequested] = useState<PageScoped<number> | null>(null)
  const [draftState, setDraftState] = useState<PageScoped<SectionDrafts> | null>(null)

  const rendering = enabled ? detail.data?.rendering ?? null : null
  const drafts = scoped(draftState, pageId, NO_DRAFTS)

  const sections = useMemo<EditorSection[]>(() => {
    if (!page || !rendering) return []
    return page.sections
      .filter((section) => !section.isPruned)
      .flatMap((section) => {
        const rendered = rendering.sections.find((r) => r.sectionIndex === section.sectionIndex)
        if (!rendered) return []
        return [
          {
            sectionIndex: section.sectionIndex,
            sectionId: section.sectionId,
            isActivity: section.isActivity,
            html: serializeHtml(parseHtml(codec.toCanvas(rendered.html))),
          },
        ]
      })
  }, [page, rendering, codec])

  const activeSection = useMemo(() => {
    if (sections.length === 0) return null
    const wanted = scoped(requested, pageId, null)
    return sections.find((section) => section.sectionIndex === wanted) ?? sections[0]
  }, [sections, requested, pageId])

  const activeHtml = activeSection
    ? drafts[activeSection.sectionIndex] ?? activeSection.html
    : ""

  const selectSection = useCallback((forPageId: string, sectionIndex: number) => {
    setRequested({ pageId: forPageId, value: sectionIndex })
  }, [])

  const setDraft = useCallback(
    (sectionIndex: number, html: string) => {
      if (!pageId) return
      const baseline = sections.find((section) => section.sectionIndex === sectionIndex)?.html
      if (baseline === undefined) return
      setDraftState((previous) => {
        const current = scoped(previous, pageId, NO_DRAFTS)
        const next = withDraft(current, sectionIndex, html, baseline)
        if (next === current && previous?.pageId === pageId) return previous
        return { pageId, value: next }
      })
    },
    [pageId, sections],
  )

  const save = useCallback(async () => {
    if (!pageId || !rendering || !hasDrafts(drafts)) return
    await saveRendering(applyDrafts(rendering, drafts, codec))
    setDraftState({ pageId, value: NO_DRAFTS })
  }, [pageId, rendering, drafts, codec, saveRendering])

  const discard = useCallback(() => {
    if (!pageId) return
    setDraftState({ pageId, value: NO_DRAFTS })
  }, [pageId])

  const status: EditorStatus = !pageId
    ? "idle"
    : detail.isPending
      ? "loading"
      : detail.error
        ? "error"
        : sections.length === 0
          ? "empty"
          : "ready"

  return useMemo(
    () => ({
      pageId,
      status,
      error: detail.error,
      sections,
      activeSection,
      activeHtml,
      selectSection,
      drafts,
      setDraft,
      dirty: hasDrafts(drafts),
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
      activeHtml,
      selectSection,
      drafts,
      setDraft,
      saving,
      save,
      discard,
    ],
  )
}
