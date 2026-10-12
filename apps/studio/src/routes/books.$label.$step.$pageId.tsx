import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { useCallback } from "react"
import { StepViewRouter } from "@/components/pipeline/components/StepViewRouter"

/**
 * Which slide is open, by stable section id.
 *
 * The page alone does not identify it: one source page can hold several
 * sections, each its own output slide. Keeping the selection in the URL rather
 * than in component state is what makes a refresh, a browser Back and a shared
 * link land on the slide the user was actually looking at.
 *
 * A search param rather than a path segment, so every existing link to
 * `/books/$label/$step/$pageId` keeps working and the stage rail can carry the
 * page between stages without carrying a section the next one may not have.
 */
export const StepSearch = z.object({
  section: z.string().optional(),
  // Pre-existing params these routes already carried untyped: the validation
  // tab, and the bundle page the preview should open on.
  tab: z.string().optional(),
  previewHref: z.string().optional(),
})

export const Route = createFileRoute("/books/$label/$step/$pageId")({
  component: StepPageDetailPage,
  validateSearch: StepSearch,
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
          // Explicit, though TanStack drops search on navigate anyway: the
          // section param names a section of the page being left, so carrying
          // it would point at a section this page does not have. Callers that
          // know which slide they want pass it through `selectSlide`.
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
