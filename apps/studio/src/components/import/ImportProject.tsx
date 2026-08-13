import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  Upload,
  Loader2,
  FileUp,
  AlertCircle,
  FileArchive,
  Check,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/sonner"
import { ActivityClassificationDialog } from "@/components/import/ActivityClassificationDialog"
import { ImportReview } from "@/components/import/ImportReview/ImportReview"
import { FileDropOverlay, useFileDropZone } from "@/components/ui/file-drop-overlay"
import { cn, formatBytes, isZipFile } from "@/lib/utils"
import { useImportAdtProject, useImportBook } from "@/hooks/use-books"
import { useFriendlyArchiveError, type FriendlyError } from "@/hooks/use-archive-error"
import { api, isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import type { AdtBundleImportPreview, AnyImportPreview } from "@/api/client"
import { getImportProjectReviewFixture } from "@/components/import/import-project-review-fixtures"

const EMPTY_ACTIVITY_REVIEW: AdtBundleImportPreview["activityReview"] = {
  inventoryVersion: null,
  items: [],
  needsReviewCount: 0,
  quizCount: 0,
  activityCount: 0,
  typeOptions: [],
}

type ImportPhase = "select" | "reading" | "review" | "importing"

function ImportProgress({
  phase,
  hasPreviewError,
  hasImportError,
  reviewNeedsAttention = false,
}: {
  phase: ImportPhase
  hasPreviewError: boolean
  hasImportError: boolean
  reviewNeedsAttention?: boolean
}) {
  const { t } = useLingui()
  const activeIndex = phase === "select" ? 0 : phase === "reading" || phase === "review" ? 1 : 2
  const steps = [t`Select archive`, t`Review details`, t`Import project`]

  return (
    <ol aria-label={t`Import progress`} className="mx-auto mt-5 flex w-full max-w-xl items-start">
      {steps.map((label, index) => {
        const complete = index < activeIndex
        const current = index === activeIndex
        const failed = (hasPreviewError && index === 1) || (hasImportError && index === 2)
        const needsAttention = reviewNeedsAttention && index === 1
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-2 text-center">
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-1/2 top-3 h-px w-full transition-colors duration-150",
                  complete ? "bg-primary" : "bg-slate-200",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors duration-150",
                failed
                  ? "border-red-500 bg-red-50 text-red-600"
                  : needsAttention
                    ? "border-amber-500 bg-amber-50 text-amber-700 ring-4 ring-amber-100/70"
                  : complete
                    ? "border-primary bg-primary text-primary-foreground"
                    : current
                      ? "border-primary bg-white text-primary ring-4 ring-primary/15"
                      : "border-slate-300 bg-white text-slate-400",
              )}
              aria-current={current ? "step" : undefined}
            >
              {failed || needsAttention ? (
                <>
                  <AlertCircle aria-hidden="true" className="h-3 w-3" />
                  <span className="sr-only">
                    {failed ? <Trans>Failed</Trans> : <Trans>Needs attention</Trans>}
                  </span>
                </>
              ) : complete ? (
                <>
                  <Check aria-hidden="true" className="h-3 w-3" />
                  <span className="sr-only"><Trans>Completed</Trans></span>
                </>
              ) : index + 1}
            </span>
            <span className={cn(
              "relative z-10 whitespace-nowrap text-xs",
              current || complete ? "font-medium text-slate-800" : "text-slate-500",
              failed && "font-medium text-red-700",
              needsAttention && "font-medium text-amber-800",
            )}>
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ImportStatus({
  error,
  rawError,
}: {
  error: FriendlyError
  rawError: string | null
}) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div aria-live="polite">
      <div className="flex min-h-[56px] items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-red-800 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{error.title}</p>
          {error.hint ? (
            <p className="mt-0.5 max-w-3xl text-xs leading-relaxed opacity-80">{error.hint}</p>
          ) : null}
          {rawError ? (
            <div className="mt-1.5 text-xs">
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                aria-haspopup="dialog"
                className="inline-flex items-center gap-1 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
              >
                <Trans>Show error details</Trans>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {rawError ? (
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-xl">
            <DialogHeader className="space-y-3">
              <DialogTitle><Trans>Error details</Trans></DialogTitle>
              <DialogDescription>{error.hint}</DialogDescription>
            </DialogHeader>
            <p className="max-h-[50vh] overflow-auto break-words rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
              {rawError}
            </p>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

function isReadyImportPreview(preview: AnyImportPreview): boolean {
  if (isAdtBundleImportPreview(preview)) return preview.compatibility.supported
  if (isPartImportPreview(preview)) return true
  return !preview.validationError
}

function ArchiveReviewSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid min-h-[430px] w-full grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-[minmax(0,1fr)_240px]"
    >
      <div className="motion-safe:animate-pulse">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="h-5 w-28 rounded-full bg-slate-100" />
          <div className="mt-3 h-6 w-56 rounded bg-slate-200" />
        </div>
        <div className="p-5 pt-3">
          <div className="grid h-10 grid-cols-3 gap-1 rounded-md bg-slate-100 p-1">
            <div className="rounded bg-white shadow-sm" />
            <div className="rounded bg-slate-100" />
            <div className="rounded bg-slate-100" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="h-16 rounded-lg bg-slate-100" />
            <div className="h-16 rounded-lg bg-slate-100" />
            <div className="h-16 rounded-lg bg-slate-100" />
          </div>
          <div className="mt-4 h-24 rounded-lg bg-slate-100" />
        </div>
      </div>
      <div className="hidden items-center justify-center border-l border-slate-200 bg-slate-50/80 p-6 md:flex">
        <div className="aspect-[3/4] w-40 rounded-md bg-slate-200 motion-safe:animate-pulse" />
      </div>
    </div>
  )
}

function SelectedArchiveBar({
  file,
  displaySize,
  disabled,
  onReplace,
}: {
  file: File
  displaySize: number
  disabled: boolean
  onReplace: () => void
}) {
  return (
    <div className="mb-3 flex min-h-10 items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <FileArchive className="h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-800">{file.name}</p>
          <p className="text-[11px] text-slate-500">{formatBytes(displaySize)}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onReplace}
        disabled={disabled}
        className="shrink-0 text-slate-600"
      >
        <FileUp className="h-4 w-4" />
        <Trans>Replace archive</Trans>
      </Button>
    </div>
  )
}

export function ImportProject() {
  const { t } = useLingui()
  const navigate = useNavigate()
  const importMutation = useImportBook()
  const adtImportMutation = useImportAdtProject()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewRequestRef = useRef(0)
  const reviewSearchParams = new URLSearchParams(window.location.search)
  const reviewFixture = import.meta.env.DEV
    ? getImportProjectReviewFixture(reviewSearchParams.get("uiReview"))
    : null
  const [zipFile, setZipFile] = useState<File | null>(() => reviewFixture?.fileName
    ? new File(
      [new Uint8Array(Math.min(reviewFixture.fileSize ?? 1, 1_024))],
      reviewFixture.fileName,
      { type: "application/zip" },
    )
    : null)
  const [preview, setPreview] = useState<AnyImportPreview | null>(reviewFixture?.preview ?? null)
  const [previewLoading, setPreviewLoading] = useState(reviewFixture?.previewLoading ?? false)
  const [previewError, setPreviewError] = useState<string | null>(reviewFixture?.previewError ?? null)
  const [activityDecisions, setActivityDecisions] = useState<Record<string, string | null>>(
    reviewFixture?.activityDecisions ?? {},
  )
  const [activityDialogOpen, setActivityDialogOpen] = useState(reviewFixture?.activityDialogOpen ?? false)

  useEffect(() => {
    if (reviewFixture?.preview && isReadyImportPreview(reviewFixture.preview)) {
      toast.success(t`Archive ready to review`)
    }
  }, [reviewFixture?.state, t])

  const friendlyPreviewError = useFriendlyArchiveError(previewError)
  const rawImportError = reviewFixture?.importError ?? adtImportMutation.error?.message
    ?? (importMutation.error
      ? importMutation.error instanceof Error
        ? importMutation.error.message
        : String(importMutation.error)
      : null)
  const friendlyImportError = useFriendlyArchiveError(rawImportError)
  const rawPreviewValidationError = preview
    && !isPartImportPreview(preview)
    && !isAdtBundleImportPreview(preview)
    ? preview.validationError
    : null
  const friendlyPreviewValidationError = useFriendlyArchiveError(rawPreviewValidationError)
  const importPending = reviewFixture?.importPending
    ?? (importMutation.isPending || adtImportMutation.isPending)
  const unsupportedAdt = Boolean(
    preview
    && isAdtBundleImportPreview(preview)
    && !preview.compatibility.supported,
  )

  const loadPreview = useCallback(async (file: File) => {
    if (importPending) return
    const requestId = ++previewRequestRef.current
    setPreviewLoading(true)
    setPreviewError(null)
    setPreview(null)
    setActivityDecisions({})
    setActivityDialogOpen(false)
    importMutation.reset()
    adtImportMutation.reset()
    try {
      const result = await api.previewImport(file)
      if (requestId !== previewRequestRef.current) return
      setPreview(result)
      if (isReadyImportPreview(result)) toast.success(t`Archive ready to review`)
    } catch (err) {
      if (requestId !== previewRequestRef.current) return
      setPreviewError(err instanceof Error ? err.message : t`Failed to read archive`)
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false)
    }
  }, [t, importMutation.reset, adtImportMutation.reset, importPending])

  const handleAccept = useCallback((f: File) => {
    if (importPending) return
    setZipFile(f)
    loadPreview(f)
  }, [importPending, loadPreview])

  const { overlay } = useFileDropZone({
    accept: isZipFile,
    onAccept: handleAccept,
    enabled: !importPending,
  })

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0]
      if (!importPending && picked && isZipFile(picked)) handleAccept(picked)
      e.target.value = ""
    },
    [handleAccept, importPending],
  )

  const handleImport = useCallback(() => {
    if (importPending || !zipFile || !preview) return
    if (isAdtBundleImportPreview(preview)) {
      if (!preview.compatibility.supported) return
      const activityReview = preview.activityReview ?? EMPTY_ACTIVITY_REVIEW
      const unresolved = activityReview.items.some((item) => (
        item.status === "needs-review"
        && !Object.prototype.hasOwnProperty.call(activityDecisions, item.sectionId)
      ))
      if (unresolved) {
        setActivityDialogOpen(true)
        return
      }
      const decisions = activityReview.items
        .filter((item) => item.status === "needs-review")
        .map((item) => ({
          sectionId: item.sectionId,
          type: activityDecisions[item.sectionId] ?? null,
        }))
      adtImportMutation.mutate({ zip: zipFile, activityDecisions: decisions }, {
        onSuccess: (book) => navigate({
          to: "/books/$label/$step",
          params: { label: book.label, step: "book" },
        }),
      })
      return
    }
    importMutation.mutate(zipFile, {
      onSuccess: () => navigate({ to: "/" }),
    })
  }, [
    importPending,
    zipFile,
    preview,
    activityDecisions,
    importMutation,
    adtImportMutation,
    navigate,
  ])

  const hasPreview = !!(zipFile && preview && !previewError)
  const activeError = friendlyImportError ?? friendlyPreviewError ?? friendlyPreviewValidationError
  const previewValidationInReview = Boolean(hasPreview && friendlyPreviewValidationError)
  const statusError = previewValidationInReview
    ? friendlyImportError ?? friendlyPreviewError
    : activeError

  const unresolvedActivityCount = preview && isAdtBundleImportPreview(preview)
    ? (preview.activityReview ?? EMPTY_ACTIVITY_REVIEW).items.filter((item) => (
        item.status === "needs-review"
        && !Object.prototype.hasOwnProperty.call(activityDecisions, item.sectionId)
      )).length
    : 0
  const activityReview = preview && isAdtBundleImportPreview(preview)
    ? preview.activityReview ?? EMPTY_ACTIVITY_REVIEW
    : null

  const phase: ImportPhase = importPending || friendlyImportError
    ? "importing"
    : previewLoading || friendlyPreviewError || (friendlyPreviewValidationError && !previewValidationInReview)
        ? "reading"
        : hasPreview
          ? "review"
          : "select"
  const rawStatusError = friendlyImportError
    ? rawImportError
    : friendlyPreviewError
      ? previewError
      : statusError
        ? rawPreviewValidationError
        : null

  return (
    <>
      <FileDropOverlay
        overlay={overlay}
        dropLabel={<Trans>Drop ZIP here</Trans>}
        errorLabel={<Trans>Only ZIP files are supported</Trans>}
        accent="blue"
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        disabled={importPending}
        className="hidden"
        onChange={handleFileChange}
      />

      {activityReview && activityReview.needsReviewCount > 0 ? (
        <ActivityClassificationDialog
          open={activityDialogOpen}
          onOpenChange={setActivityDialogOpen}
          review={activityReview}
          decisions={activityDecisions}
          onDecision={(sectionId, type) => setActivityDecisions((current) => ({
            ...current,
            [sectionId]: type,
          }))}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/40">
        <div className="flex min-h-full flex-col items-center justify-center px-4 py-8">
          <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="shrink-0 px-6 pt-8 pb-3 text-center">
            <h1 className="text-2xl font-semibold tracking-[-0.5px] text-slate-950 sm:text-[28px]">
              <Trans>Import a book</Trans>
            </h1>
            <p className="mx-auto mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
              <Trans>Bring in an ADT Studio project, a completed book part, or an exported ADT publication.</Trans>
            </p>
            <ImportProgress
              phase={phase}
              hasPreviewError={Boolean(
                friendlyPreviewError
                || (friendlyPreviewValidationError && !previewValidationInReview)
              )}
              hasImportError={Boolean(friendlyImportError)}
              reviewNeedsAttention={Boolean(
                unsupportedAdt || unresolvedActivityCount > 0 || previewValidationInReview
              )}
            />
          </header>

          <main className="min-h-0 px-6 pb-6 pt-2">
            <div className="w-full">
              {zipFile ? (
                <SelectedArchiveBar
                  file={zipFile}
                  displaySize={reviewFixture?.fileSize ?? zipFile.size}
                  disabled={importPending}
                  onReplace={() => fileInputRef.current?.click()}
                />
              ) : null}
              {statusError ? (
                <div className="mb-3">
                  <ImportStatus
                    error={statusError}
                    rawError={rawStatusError}
                  />
                </div>
              ) : null}
              {previewLoading ? (
                <ArchiveReviewSkeleton />
              ) : hasPreview && zipFile && preview ? (
                <div aria-busy={importPending}>
                  <ImportReview
                    key={zipFile.name}
                    preview={preview}
                    unresolvedActivityCount={unresolvedActivityCount}
                    onReviewActivities={() => setActivityDialogOpen(true)}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        fileInputRef.current?.click()
                      }
                    }}
                    aria-label={t`Upload ZIP or drag and drop`}
                    className={cn(
                      "group relative flex min-h-[300px] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-white px-8 py-10 text-center shadow-sm transition-[border-color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      friendlyPreviewError
                        ? "border-red-300 bg-red-50/30 hover:border-red-400 hover:bg-red-50/50"
                        : "border-slate-300 hover:border-primary/60 hover:bg-primary/[0.025] hover:shadow-md",
                    )}
                  >
                    <span className={cn(
                      "flex size-[70px] items-center justify-center rounded-[20px] shadow-[0_30px_60px_-20px_rgba(43,127,255,0.25),0_4px_14px_rgba(0,0,0,0.08)] transition-transform duration-200 motion-safe:group-hover:scale-[1.02]",
                      friendlyPreviewError
                        ? "bg-red-100 text-red-600"
                        : "bg-primary text-primary-foreground",
                    )}>
                      <Upload className="size-[34px]" />
                    </span>
                    <p className="mt-5 text-[19px] font-bold tracking-[-0.01em] text-slate-950">
                      {friendlyPreviewError
                        ? <Trans>Choose another archive</Trans>
                        : <Trans>Select a ZIP archive</Trans>}
                    </p>
                    <p className="mt-2 max-w-[400px] text-[13px] leading-relaxed text-slate-600">
                      <Trans>Click to browse, or drag and drop a ZIP anywhere in this window.</Trans>
                    </p>
                    <p className="mt-3 text-xs font-medium text-slate-500">
                      <Trans>ZIP archive · Maximum 512 MiB</Trans>
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-600">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"><Trans>Project backup</Trans></span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"><Trans>Completed book part</Trans></span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"><Trans>Exported ADT Web ZIP</Trans></span>
                    </div>
                  </div>
                  {!zipFile ? (
                    <p className="text-center text-xs text-slate-500">
                      <Trans>Starting from a PDF?</Trans>{" "}
                      <Link
                        to="/books/new"
                        className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                      >
                        <Trans>Create a new book</Trans>
                      </Link>
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </main>

          <footer className="shrink-0 border-t border-slate-200 bg-slate-50/70 px-6 py-4">
            <div className="flex w-full items-center justify-between gap-4">
              <Button
                variant="secondary"
                onClick={() => navigate({ to: "/" })}
                disabled={importPending}
                className="h-9 border-0 bg-slate-200/70 px-3 text-slate-800 hover:bg-slate-200"
              >
                <ArrowLeft className="h-4 w-4" />
                <Trans>Back</Trans>
              </Button>
              <Button
                disabled={
                  !preview ||
                  (!isPartImportPreview(preview) && !isAdtBundleImportPreview(preview) && !!preview.validationError) ||
                  importPending
                }
                onClick={unsupportedAdt ? () => fileInputRef.current?.click() : handleImport}
                className="h-9 border-0 bg-primary px-4 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {importPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    <Trans>Importing...</Trans>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {unsupportedAdt
                      ? <Trans>Choose repaired ZIP</Trans>
                      : preview && isAdtBundleImportPreview(preview)
                        ? unresolvedActivityCount > 0
                        ? <Trans>Review {unresolvedActivityCount} activities</Trans>
                        : friendlyImportError
                          ? <Trans>Try import again</Trans>
                          : <Trans>Import as new project</Trans>
                      : preview
                        ? <Trans>Import as new project</Trans>
                        : <Trans>Import</Trans>}
                  </>
                )}
              </Button>
            </div>
          </footer>
          </div>
        </div>
      </div>
    </>
  )
}
