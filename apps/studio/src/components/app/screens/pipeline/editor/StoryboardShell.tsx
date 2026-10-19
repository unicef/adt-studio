import "adt-html-editor/style.css"
import { useCallback, useMemo } from "react"
import { HtmlEditor } from "adt-html-editor/shadcn"
import { useSectionHtml } from "./draftStore"
import { fixedPageSize } from "./pageSize"
import type { StoryboardEditorSession } from "./useStoryboardEditor"
import { StyleInspection } from "./responsive/inspection/StyleInspection"
import { PositionProvider } from "./responsive/position/PositionProvider"

export interface StoryboardShellProps {
  session: StoryboardEditorSession
  children: React.ReactNode
}

export function StoryboardShell({ session, children }: StoryboardShellProps) {
  const { pageId, activeSection, setDraft } = session
  const sectionIndex = activeSection?.sectionIndex ?? null
  const baseline = activeSection?.html ?? ""
  const html = useSectionHtml(pageId, sectionIndex, baseline)

  const page = useMemo(() => fixedPageSize(baseline), [baseline])
  const fixedLayout = useMemo(() => (page ? { page } : undefined), [page])

  const onChange = useCallback(
    (next: string) => {
      if (sectionIndex !== null) setDraft(sectionIndex, next)
    },
    [sectionIndex, setDraft],
  )

  return (
    <HtmlEditor
      value={html}
      onChange={onChange}
      fixedLayout={fixedLayout}
      className="relative min-h-0 flex-1 bg-transparent text-base"
    >
      <StyleInspection><PositionProvider>{children}</PositionProvider></StyleInspection>
    </HtmlEditor>
  )
}
