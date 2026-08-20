import { createFileRoute, redirect } from "@tanstack/react-router"
import { WorkspaceScreen } from "@/components/app/screens/pipeline/WorkspaceScreen"
import { ensurePages } from "@/components/app/screens/pipeline/shared/ensurePages"

export const Route = createFileRoute("/_app/pipeline/$label/pages/$pageId")({
  beforeLoad: async ({ context, params }) => {
    const pages = await ensurePages(context.queryClient, params.label)
    // A page the book no longer has (stale bookmark, deleted page): bounce to
    // the index, which picks a page that does exist.
    if (!pages.some((page) => page.pageId === params.pageId)) {
      throw redirect({ to: "/pipeline/$label", params: { label: params.label }, replace: true })
    }
  },
  component: PageWorkspaceRoute,
})

function PageWorkspaceRoute() {
  const { label, pageId } = Route.useParams()
  return <WorkspaceScreen label={label} pageId={pageId} />
}
