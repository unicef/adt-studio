import { useState, useEffect, useRef } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { BookOpen, LayoutGrid, FileDown, ArrowRight, CheckCircle2, Loader2, Package, ExternalLink, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useBook, usePackageAdt, usePackageAdtStatus } from "@/hooks/use-books"
import { usePipelineSSE, usePipelineStatus, useRunPipeline } from "@/hooks/use-pipeline"
import { useProofStatus } from "@/hooks/use-proof"
import { useMasterStatus } from "@/hooks/use-master"
import { useApiKey } from "@/hooks/use-api-key"
import { PipelineProgress } from "@/components/pipeline/PipelineProgress"
import { PagePreviewGrid } from "@/components/pipeline/PagePreviewGrid"
import { getAdtUrl } from "@/api/client"

export const Route = createFileRoute("/books/$label/")({
  component: BookDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    autoRun: search.autoRun === true || search.autoRun === "true" ? true : undefined,
    startPage: typeof search.startPage === "number" ? search.startPage : undefined,
    endPage: typeof search.endPage === "number" ? search.endPage : undefined,
  }),
})

function currentStage(book: { pageCount: number; storyboardAccepted: boolean; proofCompleted: boolean }, masterCompleted: boolean) {
  if (masterCompleted) return "Complete"
  if (book.proofCompleted) return "Master"
  if (book.storyboardAccepted) return "Proof"
  if (book.pageCount > 0) return "Storyboard"
  return "New"
}

function BookDetailPage() {
  const { label } = Route.useParams()
  const { autoRun, startPage: searchStartPage, endPage: searchEndPage } = Route.useSearch()
  const navigate = useNavigate()
  const { data: book, isLoading, error } = useBook(label)
  const { apiKey, hasApiKey } = useApiKey()

  const runPipeline = useRunPipeline()
  const [sseEnabled, setSseEnabled] = useState(false)
  const { progress, reset } = usePipelineSSE(label, sseEnabled)
  const { data: pipelineStatus } = usePipelineStatus(label)

  // Status queries for stage badge + Package ADT gating
  const { data: proofStatus } = useProofStatus(label)
  const { data: masterStatus } = useMasterStatus(label)

  // Package ADT hooks
  const packageAdt = usePackageAdt()
  const { data: packageAdtStatus } = usePackageAdtStatus(label)

  // Auto-run guard
  const hasAutoRun = useRef(false)

  // Auto-reconnect to SSE if pipeline is already running
  useEffect(() => {
    if (pipelineStatus?.status === "running" && !sseEnabled) {
      setSseEnabled(true)
    }
  }, [pipelineStatus?.status, sseEnabled])

  // Auto-run pipeline when navigated from wizard
  useEffect(() => {
    if (!autoRun || hasAutoRun.current || !hasApiKey || !book) return
    hasAutoRun.current = true

    // Clean the URL
    navigate({
      to: "/books/$label",
      params: { label },
      search: {
        autoRun: undefined,
        startPage: undefined,
        endPage: undefined,
      },
      replace: true,
    })

    // Trigger pipeline
    reset()
    setSseEnabled(true)

    const options: { startPage?: number; endPage?: number } = {}
    if (searchStartPage) options.startPage = searchStartPage
    if (searchEndPage) options.endPage = searchEndPage

    runPipeline.mutate(
      { label, apiKey, options: Object.keys(options).length > 0 ? options : undefined },
      {
        onError: () => {
          setSseEnabled(false)
        },
      }
    )
  }, [autoRun, hasApiKey, book, label, apiKey, searchStartPage, searchEndPage, navigate, reset, runPipeline])

  const handleRun = () => {
    reset()
    setSseEnabled(true)

    runPipeline.mutate(
      { label, apiKey },
      {
        onError: () => {
          setSseEnabled(false)
        },
      }
    )
  }

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading book...</div>
  }

  if (error) {
    return (
      <div className="p-4 text-destructive">
        Failed to load book: {error.message}
      </div>
    )
  }

  if (!book) return null

  const masterCompleted = masterStatus?.status === "completed"
  const canRunMaster =
    book.storyboardAccepted &&
    (book.proofCompleted || proofStatus?.status === "completed")
  const hasAdt = packageAdtStatus?.hasAdt ?? false
  const stage = currentStage(book, masterCompleted ?? false)

  // Show pipeline as complete when server confirms OR when pages exist (server
  // status is ephemeral/in-memory, so after restart it returns "idle" even if
  // the pipeline completed previously).
  const serverCompleted = pipelineStatus?.status === "completed"
  const impliedCompleted = !serverCompleted && book.pageCount > 0
  const effectiveProgress =
    !progress.isRunning && !progress.isComplete && !progress.error &&
    (serverCompleted || impliedCompleted)
      ? { ...progress, isComplete: true }
      : progress

  return (
    <div className="p-4 space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
            ADT Studio
          </Link>
          <span className="text-muted-foreground/50 shrink-0">/</span>
          <h1 className="text-lg font-semibold truncate">
            {book.title ?? book.label}
          </h1>
        </div>
        {book.needsRebuild ? (
          <Badge variant="destructive">Needs rebuild</Badge>
        ) : (
          <Badge variant={book.pageCount > 0 ? "default" : "secondary"}>
            {book.pageCount > 0 ? `${book.pageCount} pages` : "New"}
          </Badge>
        )}
        <Badge
          variant="outline"
          className={
            stage === "Complete"
              ? "border-green-300 bg-green-50 text-green-800"
              : stage === "New"
                ? ""
                : "border-primary/30 bg-primary/5 text-primary"
          }
        >
          {stage === "Complete" && <CheckCircle2 className="mr-1 h-3 w-3" />}
          {stage}
        </Badge>
        {book.pageCount > 0 && (
          <Link to="/books/$label/storyboard" params={{ label }} search={{ page: undefined }}>
            <Button variant="outline" size="sm">
              <LayoutGrid className="mr-2 h-4 w-4" />
              Storyboard
            </Button>
          </Link>
        )}
        <Link to="/books/$label/v2/$step" params={{ label, step: "extract" }}>
          <Button variant="outline" size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            Try New UI
          </Button>
        </Link>
      </div>

      {/* Rebuild warning */}
      {book.needsRebuild && (
        <Card>
          <CardHeader>
            <CardTitle>Rebuild Required</CardTitle>
            <CardDescription>
              {book.rebuildReason ??
                "This book was created with an older storage schema and must be rebuilt."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Book Details */}
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4" />
              Book Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {book.metadata ? (
              <dl className="space-y-3 text-sm">
                {book.metadata.title && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Title</dt>
                    <dd>{book.metadata.title}</dd>
                  </div>
                )}
                {book.metadata.authors.length > 0 && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Authors</dt>
                    <dd>{book.metadata.authors.join(", ")}</dd>
                  </div>
                )}
                {book.metadata.publisher && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Publisher</dt>
                    <dd>{book.metadata.publisher}</dd>
                  </div>
                )}
                {book.metadata.language_code && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Language</dt>
                    <dd>{book.metadata.language_code}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">Pages</dt>
                  <dd>{book.pageCount > 0 ? `${book.pageCount} extracted` : "None yet"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No metadata extracted yet. Run the pipeline to extract book details.
              </p>
            )}
            {book.pageCount > 0 && (
              <Link to="/books/$label/storyboard" params={{ label }} search={{ page: undefined }} className="mt-4 block">
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                  Go to Storyboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Right: Pipeline Progress */}
        <PipelineProgress
          progress={effectiveProgress}
          onRun={handleRun}
          isStarting={runPipeline.isPending}
          hasApiKey={hasApiKey}
        />
      </div>

      {/* Package ADT — shown after master completes */}
      {canRunMaster && masterCompleted && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {(packageAdt.isSuccess || hasAdt) && !packageAdt.isPending && (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  )}
                  {packageAdt.isError && (
                    <Package className="h-5 w-5 text-destructive" />
                  )}
                  Package ADT
                </CardTitle>
                <CardDescription className="mt-1">
                  {packageAdt.isPending && "Packaging ADT..."}
                  {packageAdt.isError && `Packaging failed: ${packageAdt.error.message}`}
                  {!packageAdt.isPending && !packageAdt.isError && (packageAdt.isSuccess || hasAdt)
                    ? "ADT packaged and ready to view."
                    : !packageAdt.isPending && !packageAdt.isError && "Build a standalone web application from the book."}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {(packageAdt.isSuccess || hasAdt) && !packageAdt.isPending && (
                  <a
                    href={getAdtUrl(label)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View ADT
                    </Button>
                  </a>
                )}
                <Button
                  onClick={() => packageAdt.mutate(label)}
                  disabled={packageAdt.isPending}
                  size="sm"
                >
                  {packageAdt.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Package className="mr-2 h-4 w-4" />
                  )}
                  {packageAdt.isPending
                    ? "Packaging..."
                    : packageAdt.isSuccess || hasAdt
                      ? "Re-package"
                      : packageAdt.isError
                        ? "Retry"
                        : "Package ADT"}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Full-width page preview grid */}
      {(effectiveProgress.isRunning || effectiveProgress.isComplete || book.pageCount > 0) && (
        <PagePreviewGrid label={label} isRunning={effectiveProgress.isRunning} />
      )}
    </div>
  )
}
