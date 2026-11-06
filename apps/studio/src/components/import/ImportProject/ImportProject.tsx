import { useCallback, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Loader2, Upload } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { ActivityClassificationDialog } from "@/components/import/ActivityClassificationDialog"
import { ImportReview, type ImportState } from "@/components/import/ImportReview/ImportReview"
import { UnreadableReview } from "@/components/import/ImportReview/UnreadableReview"
import { FileDropOverlay, useFileDropZone } from "@/components/ui/file-drop-overlay"
import { cn, isZipFile } from "@/lib/utils"
import { useImportAdtProject, useImportBook } from "@/hooks/use-books"
import { useFriendlyArchiveError } from "@/hooks/use-archive-error"
import { api, isAdtBundleImportPreview, isPartImportPreview, unreadableAdtDetails } from "@/api/client"
import type { AdtImportUnreadableDetails, AnyImportPreview } from "@/api/client"
import { ArchiveCanvas } from "./ArchiveCanvas"
import { ImportHeader } from "./ImportHeader"
import type { ImportStep } from "./ImportProgress"
import { EMPTY_ACTIVITY_REVIEW } from "./helpers"
import { canRepairByEditing } from "./repair-prompt"
import { useCanvasView } from "./use-canvas-view"

const ENTER = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-300"

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
  const [previewErrorDetails, setPreviewErrorDetails] = useState<AdtImportUnreadableDetails | null>(null)
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
    setPreviewErrorDetails(null)
    setPreview(null)
    setActivityDecisions({})
    setActivityDialogOpen(false)
    importMutation.reset()
    adtImportMutation.reset()
    try {
      const result = await api.previewImport(file)
      if (requestId !== previewRequestRef.current) return
      setPreview(result)
    } catch (err) {
      if (requestId !== previewRequestRef.current) return
      setPreviewError(err instanceof Error ? err.message : t`Failed to read archive`)
      setPreviewErrorDetails(unreadableAdtDetails(err))
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
  // An ADT export that couldn't be read, but whose book could still be
  // identified: shown like the repair review instead of the canvas.
  const unreadable = !previewLoading && zipFile && previewError && previewErrorDetails && canRepairByEditing(previewError)
    ? { file: zipFile, details: previewErrorDetails, rawError: previewError }
    : null
  const showsBook = hasPreview || unreadable !== null
  const openPicker = useCallback(() => fileInputRef.current?.click(), [])
  const retryPreview = useCallback(() => { if (zipFile) loadPreview(zipFile) }, [zipFile, loadPreview])

  const decidedSectionIds = useMemo(() => new Set(Object.keys(activityDecisions)), [activityDecisions])
  const unresolvedActivityCount = preview && isAdtBundleImportPreview(preview)
    ? (preview.activityReview ?? EMPTY_ACTIVITY_REVIEW).items.filter((item) => (
        item.status === "needs-review"
        && !Object.prototype.hasOwnProperty.call(activityDecisions, item.sectionId)
      )).length
    : 0
  const activityReview = preview && isAdtBundleImportPreview(preview)
    ? preview.activityReview ?? EMPTY_ACTIVITY_REVIEW
    : null

  const canvasView = useCanvasView({
    overlay: showsBook ? null : overlay,
    reading: previewLoading,
    file: zipFile,
    error: friendlyPreviewError,
    rawError: previewError,
    onBrowse: openPicker,
    onRetry: retryPreview,
  })
  const importState: ImportState = importPending ? "importing" : friendlyImportError ? "failed" : "idle"
  const step: ImportStep = importState !== "idle" ? 3 : previewLoading || showsBook ? 2 : 1
  const failedStep: ImportStep | null = importState === "failed" ? 3 : friendlyPreviewError && !previewLoading && !unreadable ? 1 : null

  return (
    <>
      {showsBook ? (
        <FileDropOverlay
          overlay={overlay}
          dropLabel={<Trans>Drop ZIP here</Trans>}
          errorLabel={<Trans>Only ZIP files are supported</Trans>}
          accent="blue"
        />
      ) : null}

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

      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
        <main
          className={cn(
            "mx-auto flex w-full max-w-[max(72rem,72vw)] flex-1 flex-col gap-5 px-4 pb-6 pt-7 sm:px-8 2xl:px-16",
            // The review fits the window and scrolls inside its columns; the select
            // step keeps its natural height and scrolls the page in short windows.
            showsBook && "min-h-0",
            ENTER,
          )}
        >
          <ImportHeader step={step} failedStep={failedStep} />
          {hasPreview && zipFile && preview ? (
            <ImportReview
              key={zipFile.name}
              preview={preview}
              file={zipFile}
              unresolvedActivityCount={unresolvedActivityCount}
              decidedSectionIds={decidedSectionIds}
              onReviewActivities={() => setActivityDialogOpen(true)}
              validationError={friendlyPreviewValidationError}
              rawValidationError={rawPreviewValidationError}
              importState={importState}
              importError={friendlyImportError}
              rawImportError={rawImportError}
              onReplace={openPicker}
            />
          ) : unreadable ? (
            <UnreadableReview
              key={unreadable.file.name}
              file={unreadable.file}
              details={unreadable.details}
              rawError={unreadable.rawError}
              onReplace={openPicker}
            />
          ) : (
            <ArchiveCanvas view={canvasView} onBrowse={openPicker} />
          )}
        </main>

        <footer className="sticky bottom-0 shrink-0 border-t border-border bg-background py-4">
          <div className="mx-auto flex w-full max-w-[max(72rem,72vw)] items-center justify-between gap-4 px-4 sm:px-8 2xl:px-16">
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
                importPending || (unreadable
                  ? false
                  : !preview
                    || (!isPartImportPreview(preview) && !isAdtBundleImportPreview(preview) && !!preview.validationError))
              }
              onClick={unsupportedAdt || unreadable ? openPicker : handleImport}
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
                  {unsupportedAdt || unreadable
                    ? <Trans>Choose repaired ZIP</Trans>
                    : preview && isAdtBundleImportPreview(preview)
                      ? unresolvedActivityCount > 0
                        ? <Trans>Review {unresolvedActivityCount} activities</Trans>
                        : friendlyImportError
                          ? <Trans>Try import again</Trans>
                          : <Trans>Import as new project</Trans>
                      : preview
                        ? friendlyImportError ? <Trans>Try import again</Trans> : <Trans>Import as new project</Trans>
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
