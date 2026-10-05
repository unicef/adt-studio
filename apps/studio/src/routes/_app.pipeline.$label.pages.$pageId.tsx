import { createFileRoute, redirect } from "@tanstack/react-router"
import { WorkspaceScreen } from "@/components/app/screens/pipeline/WorkspaceScreen"
import { ensurePages } from "@/components/app/screens/pipeline/shared/ensurePages"
import { pagesQueryOptions } from "@/hooks/use-pages"

export const Route = createFileRoute("/_app/pipeline/$label/pages/$pageId")({
  beforeLoad: async ({ context, params }) => {
    const pages =
      context.queryClient.getQueryData(pagesQueryOptions(params.label).queryKey) ??
      (await ensurePages(context.queryClient, params.label))
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
