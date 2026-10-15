import { createFileRoute, Link, Outlet, notFound } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { PageErrorDecisionDialog } from "@/components/pipeline/components/PageErrorDecisionDialog"
import { BookRunProvider, useBookRunStatus } from "@/hooks/use-book-run"
import { booksQueryOptions, useBooks } from "@/hooks/use-books"
import { ensurePages } from "@/components/app/screens/pipeline/shared/ensurePages"
import { PipelineDebugDock } from "@/components/app/screens/pipeline/debug/PipelineDebugDock"
import { usePageTitle } from "@/hooks/use-page-title"
import { ScreenFallback } from "@/components/app/ui/ScreenFallback"
import { BootSplash, PipelineBootSkeleton } from "@/components/app/ui/BootSkeleton"
import { getVariant } from "@/components/app/lab/variants"
import { APP_PATHS } from "@/components/app/nav"
import { PipelineChrome } from "@/components/app/screens/pipeline/chrome/PipelineChrome"

export const Route = createFileRoute("/_app/pipeline/$label")({
  beforeLoad: async ({ context, params }) => {
    const books = await context.queryClient.ensureQueryData(booksQueryOptions())
    if (!books.some((book) => book.label === params.label)) throw notFound()
    // A book with no extraction has no page database yet, so this 404s. That is
    // a legitimate state — the workspace opens on its empty canvas — so warming
    // the cache here must not fail the route.
    await ensurePages(context.queryClient, params.label)
  },
  component: PipelineLayout,
  pendingComponent: () =>
    getVariant("boot") === "shell" ? <PipelineBootSkeleton /> : getVariant("boot") === "splash" ? <BootSplash /> : <ScreenFallback />,
  pendingMs: getVariant("boot") !== "current" ? 120 : undefined,
  errorComponent: ({ error }) => <ScreenFallback error={error} />,
  notFoundComponent: BookNotFound,
})

function BookNotFound() {
  return (
    <div className="grid h-full place-items-center gap-3 p-6 text-center text-sm">
      <p className="text-muted-foreground">
        <Trans>This book is not in your library.</Trans>
      </p>
      <Link to={APP_PATHS.library} className="font-semibold text-brand-700 hover:underline">
        <Trans>Back to library</Trans>
      </Link>
    </div>
  )
}

function PipelineLayout() {
  const { label } = Route.useParams()
  const bookRun = useBookRunStatus(label)
  const booksQuery = useBooks()
  const book = booksQuery.data?.find((entry) => entry.label === label)

  usePageTitle(book?.title ?? label)

  return (
    <BookRunProvider value={bookRun}>
      <PipelineDebugDock label={label} isRunning={bookRun.isRunning}>
        <PipelineChrome label={label}>
          <Outlet />
        </PipelineChrome>
      </PipelineDebugDock>
      <PageErrorDecisionDialog />
    </BookRunProvider>
  )
}
