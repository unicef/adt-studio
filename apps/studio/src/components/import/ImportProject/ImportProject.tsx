import { useCallback, useRef, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, FileUp, Loader2, TriangleAlert, Upload } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { ActivityClassificationDialog } from "@/components/import/ActivityClassificationDialog"
import { ImportReview } from "@/components/import/ImportReview/ImportReview"
import { FileDropOverlay, useFileDropZone } from "@/components/ui/file-drop-overlay"
import { cn, isZipFile } from "@/lib/utils"
import { useImportAdtProject, useImportBook } from "@/hooks/use-books"
import { useFriendlyArchiveError } from "@/hooks/use-archive-error"
import { api, isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import type { AnyImportPreview } from "@/api/client"
import { ImportProgress } from "./ImportProgress"
import { ImportStatus } from "./ImportStatus"
import { ArchiveReviewSkeleton } from "./ArchiveReviewSkeleton"
import { SelectedArchiveBar } from "./SelectedArchiveBar"
import { EMPTY_ACTIVITY_REVIEW, isReadyImportPreview, type ImportPhase } from "./helpers"

const ENTER = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-300"

function ArchiveDropZone({
  hasError,
  onOpen,
}: {
  hasError: boolean
  onOpen: () => void
}) {
  const { t } = useLingui()
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
      aria-label={t`Upload ZIP or drag and drop`}
      className={cn(
        "group relative mx-auto flex min-h-[300px] w-full max-w-md flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[24px] border bg-card px-8 py-10 text-center outline-none backdrop-blur-[1px] transition-[border-color,background-color,box-shadow,translate] duration-300 sm:max-h-[380px]",
        "focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        hasError
          ? "border-destructive/50 bg-destructive/5"
          : "border-border/70 shadow-sm hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md",
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.08] blur-[80px]"
        style={{ background: "radial-gradient(circle, var(--brand-500) 0%, transparent 68%)" }}
      />
      <span aria-hidden className="relative mb-6 block h-[76px] w-[96px]">
        <span className="absolute inset-x-2.5 bottom-0 h-[62px] translate-y-1 -rotate-6 rounded-lg border bg-card shadow-sm transition-transform duration-300 group-hover:-rotate-[9deg]" />
        <span className="absolute inset-x-2.5 bottom-0 h-[62px] rotate-3 rounded-lg border bg-card shadow-sm transition-transform duration-300 group-hover:rotate-[6deg]" />
        <span
          className={cn(
            "absolute inset-x-2 bottom-1 grid h-[64px] place-items-center rounded-xl border bg-card shadow-md transition-[translate,border-color,color] duration-300",
            hasError
              ? "border-destructive/50 text-destructive"
              : "text-muted-foreground group-hover:-translate-y-1 group-hover:border-brand-300 group-hover:text-brand-600",
          )}
        >
          {hasError ? <TriangleAlert className="size-6" /> : <FileUp className="size-6" />}
        </span>
      </span>
      <p className="text-[15px] font-semibold text-foreground">
        {hasError ? <Trans>Choose another archive</Trans> : <Trans>Select a ZIP archive</Trans>}
      </p>
      <p className="mt-1.5 max-w-[400px] text-[12.5px] leading-relaxed text-muted-foreground text-pretty">
        <Trans>Click to browse, or drag and drop a ZIP anywhere in this window.</Trans>
      </p>
      <p className="mt-3 text-xs font-medium text-muted-foreground/80">
        <Trans>ZIP archive · Maximum 512 MiB</Trans>
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border bg-muted px-2.5 py-1"><Trans>Project backup</Trans></span>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1"><Trans>Completed book part</Trans></span>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1"><Trans>Exported ADT Web ZIP</Trans></span>
      </div>
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
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<AnyImportPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [activityDecisions, setActivityDecisions] = useState<Record<string, string | null>>({})
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)

  const friendlyPreviewError = useFriendlyArchiveError(previewError)
  const rawImportError = adtImportMutation.error?.message
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
  const importPending = importMutation.isPending || adtImportMutation.isPending
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

      <div className="flex min-h-0 flex-1 flex-col bg-background overflow-auto">
        <header className={cn("shrink-0 px-6 pt-8 pb-2 text-center", ENTER)}>
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.75px] text-foreground text-balance sm:text-[30px] sm:leading-9">
            <Trans>Import a book</Trans>
          </h1>
          <p className="mx-auto mt-1.5 max-w-2xl text-sm text-muted-foreground text-pretty">
            <Trans>Bring in an ADT Studio project, a completed book part, or an exported ADT publication.</Trans>
          </p>
          <div className={cn(ENTER, "motion-safe:delay-100")}>
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
          </div>
        </header>

        <main className={cn("flex min-h-0 flex-1 flex-col overflow-auto px-4 pb-6 pt-4 sm:px-6", ENTER, "motion-safe:delay-150")}>
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col 2xl:max-w-7xl">
            {zipFile ? (
              <SelectedArchiveBar
                file={zipFile}
                displaySize={zipFile.size}
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
              <div aria-busy={importPending} className="flex min-h-0 flex-1 flex-col">
                <ImportReview
                  key={zipFile.name}
                  preview={preview}
                  unresolvedActivityCount={unresolvedActivityCount}
                  onReviewActivities={() => setActivityDialogOpen(true)}
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 py-4">
                <ArchiveDropZone
                  hasError={Boolean(friendlyPreviewError)}
                  onOpen={() => fileInputRef.current?.click()}
                />
                {!zipFile ? (
                  <p className="text-center text-xs text-muted-foreground">
                    <Trans>Starting from a PDF?</Trans>{" "}
                    <Link
                      to="/books/new"
                      className="font-medium text-brand-600 underline underline-offset-2 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                    >
                      <Trans>Create a new book</Trans>
                    </Link>
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </main>

        <footer className="shrink-0 border-t border-border bg-background px-6 py-4">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 2xl:max-w-7xl">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/" })}
              disabled={importPending}
              className="h-10 px-4 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              <Trans>Back</Trans>
            </Button>
            <Button
              type="button"
              disabled={
                !preview ||
                (!isPartImportPreview(preview) && !isAdtBundleImportPreview(preview) && !!preview.validationError) ||
                importPending
              }
              onClick={unsupportedAdt ? () => fileInputRef.current?.click() : handleImport}
              className="h-10 min-w-[180px] px-4 font-medium"
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
    </>
  )
}
