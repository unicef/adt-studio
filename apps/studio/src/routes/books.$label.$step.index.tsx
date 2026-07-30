import { createFileRoute, useNavigate, ErrorComponentProps } from "@tanstack/react-router"
import { useCallback } from "react"
import { StepViewRouter } from "@/components/pipeline/components/StepViewRouter"
import { ErrorScreen } from "@/components/ErrorScreen"
import { parseBookStepSearch } from "@/lib/book-step-search"

function BookErrorComponent({ error, reset }: ErrorComponentProps) {
  return <ErrorScreen variant="route" error={error} reset={reset} />
}

export const Route = createFileRoute("/books/$label/$step/")({
  validateSearch: parseBookStepSearch,
  component: StepIndexPage,
  errorComponent: BookErrorComponent,
})

function StepIndexPage() {
  const { label, step } = Route.useParams()
  const navigate = useNavigate()

  const setSelectedPage = useCallback(
    (pageId: string | null) => {
      if (pageId) {
        navigate({
          to: "/books/$label/$step/$pageId",
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
