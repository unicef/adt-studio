import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { StepViewRouter } from "@/components/v2/StepViewRouter"

export const Route = createFileRoute("/books/$label/$step/$pageId")({
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
