import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { StepViewRouter } from "@/components/pipeline/components/StepViewRouter"

/**
 * A page of a stage, optionally pointed at one section and one comment on it.
 *
 * `section` and `comment` are what make a reviewer's comment openable where it was left. A
 * thread knows only its `page_section_id`, so a link that carried the page alone landed on the
 * stage's first page with nothing selected — which is what every comment row used to do.
 *
 * Both are read leniently: a stale link whose section has since been pruned, or whose comment
 * was deleted, should still open the page rather than fail the route.
 */
export const Route = createFileRoute("/books/$label/$step/$pageId")({
  validateSearch: (search: Record<string, unknown>): { section?: number; comment?: string } => {
    const section = Number(search.section)
    const comment = typeof search.comment === "string" ? search.comment : undefined
    return {
      ...(Number.isInteger(section) && section >= 0 ? { section } : {}),
      ...(comment !== undefined && comment.length > 0 ? { comment } : {}),
    }
  },
  component: StepPageDetailPage,
})

function StepPageDetailPage() {
  const { label, step, pageId } = Route.useParams()
  const navigate = useNavigate()

  const setSelectedPage = useCallback(
    (newPageId: string | null) => {
      if (newPageId) {
        navigate({
          to: "/books/$label/$step/$pageId",
          params: { label, step, pageId: newPageId },
          /** Dropped on purpose: they point at a section and a comment of the page being left. */
          search: {},
          replace: true,
        })
      } else {
        navigate({
          to: "/books/$label/$step",
          params: { label, step },
        })
      }
    },
    [navigate, label, step]
  )

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <StepViewRouter step={step} bookLabel={label} selectedPageId={pageId} onSelectPage={setSelectedPage} />
    </div>
  )
}
