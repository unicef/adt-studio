import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { StepViewRouter } from "@/components/v2/StepViewRouter"

export const Route = createFileRoute("/books/$label/v2/$step/")({
  component: StepIndexPage,
})

function StepIndexPage() {
  const { label, step } = Route.useParams()
  const navigate = useNavigate()

  const setSelectedPage = useCallback(
    (pageId: string | null) => {
      if (pageId) {
        navigate({
          to: "/books/$label/v2/$step/$pageId",
          params: { label, step, pageId },
        })
      }
    },
    [navigate, label, step]
  )

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <StepViewRouter step={step} bookLabel={label} onSelectPage={setSelectedPage} />
    </div>
  )
}
