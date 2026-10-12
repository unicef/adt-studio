import { createFileRoute, useNavigate, ErrorComponentProps } from "@tanstack/react-router"
import { useCallback } from "react"
import { StepViewRouter } from "@/components/pipeline/components/StepViewRouter"
import { ErrorScreen } from "@/components/ErrorScreen"
import { z } from "zod"

function BookErrorComponent({ error, reset }: ErrorComponentProps) {
  return <ErrorScreen variant="route" error={error} reset={reset} />
}

export const Route = createFileRoute("/books/$label/$step/")({
  component: StepIndexPage,
  errorComponent: BookErrorComponent,
  // Accepted so `/books/x/storyboard?section=…` is a valid address at all — the
  // storyboard view reads it and redirects to the page that section belongs to.
  // The redirect re-states it explicitly; TanStack drops search on navigate.
  validateSearch: z.object({
    section: z.string().optional(),
    // Pre-existing params these routes already carried untyped: the validation
    // tab, and the bundle page the preview should open on.
    tab: z.string().optional(),
    previewHref: z.string().optional(),
  }),
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
