import "adt-html-editor/style.css"
import { useMemo } from "react"
import { HtmlEditor } from "adt-html-editor/shadcn"
import { fixedPageSize } from "./pageSize"
import type { StoryboardEditorSession } from "./useStoryboardEditor"

export interface StoryboardShellProps {
  session: StoryboardEditorSession
  children: React.ReactNode
}

export function StoryboardShell({ session, children }: StoryboardShellProps) {
  const { activeSection, activeHtml, setDraft } = session
  const sectionIndex = activeSection?.sectionIndex ?? null
  const sectionHtml = activeSection?.html ?? ""
  const page = useMemo(() => fixedPageSize(sectionHtml), [sectionHtml])
  const fixedLayout = useMemo(() => (page ? { page } : undefined), [page])

  return (
    <HtmlEditor
      value={activeHtml}
      onChange={(html) => {
        if (sectionIndex != null) setDraft(sectionIndex, html)
      }}
      fixedLayout={fixedLayout}
      className="relative min-h-0 flex-1 bg-transparent text-base"
    >
      {children}
    </HtmlEditor>
  )
}
