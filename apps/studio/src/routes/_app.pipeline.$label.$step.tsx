import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { isDockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import { isStepSettingsSlug } from "@/components/app/screens/pipeline/settings/slugs"

export const Route = createFileRoute("/_app/pipeline/$label/$step")({
  // Storyboard has settings but no step view of its own, and Sign Language the
  // other way round, so this only rejects slugs that are neither.
  beforeLoad: ({ params }) => {
    if (!isDockSlug(params.step) && !isStepSettingsSlug(params.step)) {
      throw redirect({ to: "/pipeline/$label", params: { label: params.label }, replace: true })
    }
  },
  component: Outlet,
})
