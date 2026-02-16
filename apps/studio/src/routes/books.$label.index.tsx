import { useState, useEffect, useRef } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { BookOpen, LayoutGrid, FileDown, CheckCircle2, Loader2, Package, ExternalLink, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useBook, useExportBook, usePackageAdt, usePackageAdtStatus } from "@/hooks/use-books"
import { usePipelineSSE, usePipelineStatus, useRunPipeline } from "@/hooks/use-pipeline"
import { useProofSSE, useProofStatus, useRunProof } from "@/hooks/use-proof"
import { useMasterSSE, useMasterStatus, useRunMaster } from "@/hooks/use-master"
import { useApiKey } from "@/hooks/use-api-key"
import { PipelineProgress } from "@/components/pipeline/PipelineProgress"
import { ProofProgress } from "@/components/proof/ProofProgress"
import { MasterProgress } from "@/components/master/MasterProgress"
import { PagePreviewGrid } from "@/components/pipeline/PagePreviewGrid"
import { ConfigEditor } from "@/components/config/ConfigEditor"
import { QuizPanel } from "@/components/storyboard/QuizPanel"
import { getAdtUrl } from "@/api/client"

export const Route = createFileRoute("/books/$label/")({
  component: BookDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    autoRun: search.autoRun === true || search.autoRun === "true" ? true : undefined,
    startPage: typeof search.startPage === "number" ? search.startPage : undefined,
    endPage: typeof search.endPage === "number" ? search.endPage : undefined,
  }),
})

function BookDetailPage() {
  const { label } = Route.useParams()
  const { autoRun, startPage: searchStartPage, endPage: searchEndPage } = Route.useSearch()
  const navigate = useNavigate()
  const { data: book, isLoading, error } = useBook(label)
  const { apiKey, hasApiKey } = useApiKey()

  const exportBook = useExportBook()
  const runPipeline = useRunPipeline()
  const [sseEnabled, setSseEnabled] = useState(false)
  const { progress, reset } = usePipelineSSE(label, sseEnabled)
  const { data: pipelineStatus } = usePipelineStatus(label)

  // Proof hooks
  const runProof = useRunProof()
  const [proofSseEnabled, setProofSseEnabled] = useState(false)
  const { progress: proofProgress, reset: proofReset } = useProofSSE(label, proofSseEnabled)
  const { data: proofStatus } = useProofStatus(label)

  // Master hooks
  const runMaster = useRunMaster()
  const [masterSseEnabled, setMasterSseEnabled] = useState(false)
  const { progress: masterProgress, reset: masterReset } = useMasterSSE(label, masterSseEnabled)
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

  // Auto-reconnect to SSE if proof is already running
  useEffect(() => {
    if (proofStatus?.status === "running" && !proofSseEnabled) {
      setProofSseEnabled(true)
    }
  }, [proofStatus?.status, proofSseEnabled])

  // Auto-reconnect to SSE if master is already running
  useEffect(() => {
    if (masterStatus?.status === "running" && !masterSseEnabled) {
      setMasterSseEnabled(true)
    }
  }, [masterStatus?.status, masterSseEnabled])

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

  const handleRun = (options: { startPage?: number; endPage?: number }) => {
    reset()
    setSseEnabled(true)

    runPipeline.mutate(
      { label, apiKey, options: Object.keys(options).length > 0 ? options : undefined },
      {
        onError: () => {
          setSseEnabled(false)
        },
      }
    )
  }

  const handleRunProof = () => {
    proofReset()
    setProofSseEnabled(false)

    runProof.mutate(
      { label, apiKey },
      {
        onSuccess: () => {
          setProofSseEnabled(true)
        },
        onError: () => {
          setProofSseEnabled(false)
        },
      }
    )
  }

  const handleRunMaster = () => {
    masterReset()
    setMasterSseEnabled(false)

    runMaster.mutate(
      { label, apiKey },
      {
        onSuccess: () => {
          setMasterSseEnabled(true)
        },
        onError: () => {
          setMasterSseEnabled(false)
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

  const showPipelineRunning = progress.isRunning || progress.isComplete || progress.error
  const canRunMaster =
    book.storyboardAccepted &&
    (book.proofCompleted ||
      proofProgress.isComplete ||
      proofStatus?.status === "completed")
  const masterCompleted =
    masterProgress.isComplete || masterStatus?.status === "completed"
  const hasAdt = packageAdtStatus?.hasAdt ?? false

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
        {book.storyboardAccepted && (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Accepted
          </Badge>
        )}
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
        {book.storyboardAccepted && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportBook.mutate(label)}
            disabled={exportBook.isPending}
          >
            {exportBook.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            Export ZIP
          </Button>
        )}
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
          </CardContent>
        </Card>

        {/* Right: Pipeline Config or Pipeline Progress */}
        {showPipelineRunning ? (
          <div className="h-full">
            <PipelineProgress
              progress={progress}
              onRun={() => handleRun({})}
              isStarting={runPipeline.isPending}
              hasApiKey={hasApiKey}
            />
          </div>
        ) : (
          <ConfigEditor
            label={label}
            onRun={handleRun}
            isRunning={progress.isRunning}
            isPipelineStarting={runPipeline.isPending}
            hasApiKey={hasApiKey}
            pageCount={book.pageCount}
          />
        )}
      </div>

      {/* Review Storyboard CTA */}
      {progress.isComplete && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium">Pipeline complete</p>
              <p className="text-xs text-muted-foreground">Review the generated storyboard</p>
            </div>
            <Link to="/books/$label/storyboard" params={{ label }} search={{ page: undefined }}>
              <Button size="sm">
                <LayoutGrid className="mr-1.5 h-4 w-4" />
                Review Storyboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Proof Phase — shown after storyboard is accepted */}
      {book.storyboardAccepted && (
        <ProofProgress
          progress={proofProgress}
          onRun={handleRunProof}
          isStarting={runProof.isPending}
          hasApiKey={hasApiKey}
        />
      )}

      {/* Master Phase — shown after storyboard is accepted */}
      {canRunMaster && (
        <MasterProgress
          progress={masterProgress}
          onRun={handleRunMaster}
          isStarting={runMaster.isPending}
          hasApiKey={hasApiKey}
        />
      )}

      {book.storyboardAccepted && !canRunMaster && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Master Phase</CardTitle>
            <CardDescription>
              Complete the proof phase before running master.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

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

      {/* Quiz results — shown after proof generates quizzes */}
      {book.storyboardAccepted && (
        <QuizPanel label={label} />
      )}

      {/* Full-width page preview grid */}
      {(progress.isRunning || progress.isComplete || book.pageCount > 0) && (
        <PagePreviewGrid label={label} isRunning={progress.isRunning} />
      )}
    </div>
  )
}
