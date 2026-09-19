import { parseHtml, serializeHtml } from "adt-html-editor"
import type { PageDetail } from "@/api/client"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { HtmlCodec } from "./renderingDraft"

export interface EditorSection {
  sectionIndex: number
  sectionId: string
  isActivity: boolean
  html: string
}

export type EditorStatus = "idle" | "loading" | "error" | "empty" | "ready"

export interface EditorStatusInput {
  pageId: string | null
  loading: boolean
  error: unknown
  sectionCount: number
}

const NO_SECTIONS: EditorSection[] = []

export function toEditorSections(
  page: PipelinePage | null,
  rendering: PageDetail["rendering"] | null,
  codec: HtmlCodec,
): EditorSection[] {
  if (!page || !rendering) return NO_SECTIONS
  const byIndex = new Map(rendering.sections.map((section) => [section.sectionIndex, section]))
  return page.sections.flatMap((section) => {
    if (section.isPruned) return []
    const rendered = byIndex.get(section.sectionIndex)
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
}

export function editorStatus({
  pageId,
  loading,
  error,
  sectionCount,
}: EditorStatusInput): EditorStatus {
  if (!pageId) return "idle"
  if (loading) return "loading"
  if (error) return "error"
  return sectionCount === 0 ? "empty" : "ready"
}
