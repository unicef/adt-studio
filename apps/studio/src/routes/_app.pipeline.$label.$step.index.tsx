import { createFileRoute, redirect } from "@tanstack/react-router"
import { StepScreen } from "@/components/app/screens/pipeline/StepScreen"
import { isDockSlug } from "@/components/app/screens/pipeline/shared/plugins"

export interface StepSearch {
  page?: string
}

export const Route = createFileRoute("/_app/pipeline/$label/$step/")({
  validateSearch: (search: Record<string, unknown>): StepSearch => ({
    ...(typeof search.page === "string" && search.page ? { page: search.page } : {}),
  }),
  beforeLoad: ({ params }) => {
    if (!isDockSlug(params.step)) {
      throw redirect({ to: "/pipeline/$label", params: { label: params.label }, replace: true })
    }
  },
  component: StepRoute,
})

function StepRoute() {
  const { label, step } = Route.useParams()
  if (!isDockSlug(step)) return null
  return <StepScreen label={label} slug={step} />
}
