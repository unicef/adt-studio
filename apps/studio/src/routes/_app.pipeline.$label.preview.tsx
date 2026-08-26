import { createFileRoute } from "@tanstack/react-router"
import { PreviewScreen } from "@/components/app/screens/pipeline/preview/PreviewScreen"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"

export interface PreviewSearch {
  /** Section the storyboard was showing — the preview opens on its page. */
  section?: string
  /** Bundle-relative page, when the caller already resolved it. */
  href?: string
}

export const Route = createFileRoute("/_app/pipeline/$label/preview")({
  validateSearch: (search: Record<string, unknown>): PreviewSearch => ({
    ...(typeof search.section === "string" && search.section ? { section: search.section } : {}),
    ...(typeof search.href === "string" && search.href ? { href: search.href } : {}),
  }),
  component: PreviewRoute,
})

function PreviewRoute() {
  const { label } = Route.useParams()
  const { section, href } = Route.useSearch()
  const nav = usePipelineNavigation(label)
  return (
    <PreviewScreen
      label={label}
      targetSectionId={section ?? null}
      targetHref={href ?? null}
      onBack={nav.openWorkspace}
    />
  )
}
