import { useCallback } from "react"
import type { PageSummarySection } from "@/api/client"
import {
  BookPreviewFrame,
  type BookPreviewFrameHandle,
} from "@/components/pipeline/stages/storyboard/components/BookPreviewFrame"
import { usePage } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { CAPTURE_WIDTH } from "../canvasLayout"
import { SectionSkeleton } from "../PageSkeleton"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { useCanvasEditing } from "./CanvasEditing"

export function EditableSectionSlice({
  label,
  pageId,
  section,
  viewport,
}: {
  label: string
  pageId: string
  section: PageSummarySection
  viewport: Viewport
}) {
  const editing = useCanvasEditing()
  const page = usePage(label, pageId)
  const sectionIndex = section.sectionIndex
  const html = page.data?.rendering?.sections.find((candidate) => candidate.sectionIndex === sectionIndex)?.html
  const selected = editing.selection?.sectionIndex === sectionIndex ? editing.selection.dataId : null
  const { registerFrame, select, recordEdit } = editing

  const attach = useCallback(
    (handle: BookPreviewFrameHandle | null) => registerFrame(sectionIndex, handle),
    [registerFrame, sectionIndex],
  )

  if (!html) return <SectionSkeleton className="min-h-80 rounded-none border-0 border-b" />

  return (
    <div
      className={cn(
        "relative border-b transition-shadow duration-200 last:border-b-0",
        selected && "shadow-[inset_0_0_0_2px_var(--brand-400)]",
      )}
    >
      <BookPreviewFrame
        ref={attach}
        html={html}
        bookLabel={label}
        editable
        renderWidth={CAPTURE_WIDTH[viewport]}
        applyBodyBackground
        autoRefreshCss
        selectedDataId={selected}
        onSelectElement={(dataId, _rect, tagName) =>
          select(dataId ? { sectionIndex, dataId, tagName } : null)
        }
        onTextChanged={(_dataId, _text, fullHtml) => recordEdit(sectionIndex, fullHtml)}
      />
    </div>
  )
}
