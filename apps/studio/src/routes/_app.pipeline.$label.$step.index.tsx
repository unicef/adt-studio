import { createFileRoute, redirect } from "@tanstack/react-router"
import { StepScreen } from "@/components/app/screens/pipeline/StepScreen"
import { isDockSlug } from "@/components/app/screens/pipeline/shared/plugins"

export const Route = createFileRoute("/_app/pipeline/$label/$step/")({
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
