import { createFileRoute, redirect } from "@tanstack/react-router"
import { WorkspaceScreen } from "@/components/app/screens/pipeline/WorkspaceScreen"
import { lastPage } from "@/components/app/screens/pipeline/shared/workspacePrefs"
import { ensurePages } from "@/components/app/screens/pipeline/shared/ensurePages"
import { pagesQueryOptions } from "@/hooks/use-pages"
import { booksQueryOptions } from "@/hooks/use-books"
import { getVariant } from "@/components/app/lab/variants"
import { consumeEntryGateSkip } from "@/components/app/screens/pipeline/shared/entryGate"

export const Route = createFileRoute("/_app/pipeline/$label/")({
  // The workspace always lives on a page route. This is the entry point every
  // "close" lands on, so it resolves which page that is: the one the canvas was
  // last showing, else the book's first.
  beforeLoad: async ({ context, params }) => {
    if (getVariant("entry") !== "current" && !consumeEntryGateSkip()) {
      const books = context.queryClient.getQueryState(booksQueryOptions().queryKey)?.isInvalidated
        ? await context.queryClient.fetchQuery(booksQueryOptions())
        : await context.queryClient.ensureQueryData(booksQueryOptions())
      const done = new Set(books.find((book) => book.label === params.label)?.completedStages ?? [])
      const foundation = !done.has("extract") ? "extract" : !done.has("sectioning") ? "sectioning" : null
      if (foundation) {
        throw redirect({
          to: "/pipeline/$label/$step",
          params: { label: params.label, step: foundation },
          replace: true,
        })
      }
    }
    const pages =
      context.queryClient.getQueryData(pagesQueryOptions(params.label).queryKey) ??
      (await ensurePages(context.queryClient, params.label))
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
