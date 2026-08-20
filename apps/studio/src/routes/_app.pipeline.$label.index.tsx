import { createFileRoute, redirect } from "@tanstack/react-router"
import { WorkspaceScreen } from "@/components/app/screens/pipeline/WorkspaceScreen"
import { lastPage } from "@/components/app/screens/pipeline/shared/workspacePrefs"
import { ensurePages } from "@/components/app/screens/pipeline/shared/ensurePages"

export const Route = createFileRoute("/_app/pipeline/$label/")({
  // The workspace always lives on a page route. This is the entry point every
  // "close" lands on, so it resolves which page that is: the one the canvas was
  // last showing, else the book's first.
  beforeLoad: async ({ context, params }) => {
    const pages = await ensurePages(context.queryClient, params.label)
    if (pages.length === 0) return
    const remembered = lastPage(params.label)
    const pageId = pages.some((page) => page.pageId === remembered)
      ? remembered!
      : pages[0].pageId
    throw redirect({
      to: "/pipeline/$label/pages/$pageId",
      params: { label: params.label, pageId },
      replace: true,
    })
  },
  component: EmptyWorkspaceRoute,
})

function EmptyWorkspaceRoute() {
  const { label } = Route.useParams()
  return <WorkspaceScreen label={label} pageId={null} />
}
