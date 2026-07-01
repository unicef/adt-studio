import { useRef, useState, type ReactNode } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { Scissors, Combine, Upload, AlertTriangle, CheckCircle2, Loader2, Sparkles, ArrowRight, FileArchive, X, Info } from "lucide-react"
import { useBook, useRegenerateBookSummary } from "../../hooks/use-books"
import { usePartInfo, usePreviewMerge, useMergePart, useSplitStatus } from "../../hooks/use-parts"
import { useApiKey } from "../../hooks/use-api-key"
import { useActiveConfig } from "../../hooks/use-debug"
import { useSourcePdfInfo } from "../../hooks/use-source-pdf-info"
import { type MergePreview, type MergeResult, type SplitStatus } from "../../api/client"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { cn, isZipFile } from "../../lib/utils"
import { useFriendlyArchiveError } from "../../hooks/use-archive-error"
import { Collapsible } from "../ui/collapsible"
import { fmtRange } from "./parts-utils"
import { CoverageBar } from "./CoverageBar"
import { ExportPartControls, useExportPartState } from "./ExportPartControls"
import { SplitPreviewDialog } from "./SplitPreviewDialog"

/**
 * Split a book into page-range "parts" for independent processing, and merge
 * completed parts back in. Surfaced on the book overview page.
 */
export function BookPartsPanel({ bookLabel }: { bookLabel: string }) {
  const { data: book } = useBook(bookLabel)
  const { data: partInfo, isLoading: partInfoLoading } = usePartInfo(bookLabel)
  const { data: pdfInfo, isLoading: pdfInfoLoading } = useSourcePdfInfo(bookLabel)
  const { data: splitStatus, isLoading: splitStatusLoading } = useSplitStatus(bookLabel)
  const { data: activeConfig } = useActiveConfig(bookLabel)
  const spreadMode = activeConfig?.merged?.spread_mode === true
  // Base the export range on the full source PDF (works before extraction and
  // isn't capped when the book was extracted with a window). Fall back to the
  // extracted page count.
  const pageCount = splitStatus?.pageCount ?? pdfInfo?.pageCount ?? book?.pageCount ?? 0
  // Until these settle we know neither whether this is an imported part nor the
  // page count — render a stable skeleton instead of flashing the wrong body
  // (the export/merge grid, then snapping to the part notice / adding the
  // "Preview & split pages" button once the queries resolve).
  const loading = partInfoLoading || pdfInfoLoading || splitStatusLoading

  // Book metadata (title, authors) is only carried in by the part that contains
  // page 1, so a split book stays untitled until that part is merged. Nudge the
  // user while page 1 is still missing and the book has no title yet.
  const page1Merged = !!splitStatus?.mergedRanges.some(
    (r) => r.startPage <= 1 && r.endPage >= 1,
  )
  const showPageOneHint =
    !!splitStatus && splitStatus.exported.length > 0 && !page1Merged && !book?.title

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-6 py-4">
        <Scissors className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Trans>Split & merge</Trans>
        </h2>
        {partInfo && (
          <Badge variant="secondary" className="ml-auto">
            <Trans>
              Imported part · pages {partInfo.range.startPage}–{partInfo.range.endPage}
            </Trans>
          </Badge>
        )}
      </header>

      {loading ? (
        <PartsPanelSkeleton />
      ) : partInfo ? (
        <p className="px-6 py-5 text-xs leading-relaxed text-muted-foreground">
          <Trans>
            Parts can't be split further. Process the assigned pages, then return
            the finished part from its Export step to merge it back into the
            source book.
          </Trans>
        </p>
      ) : (
        <>
          {splitStatus &&
            (splitStatus.exported.length > 0 || splitStatus.mergedRanges.length > 0) && (
              <div className="flex flex-col gap-3 border-b border-border/60 px-6 py-4">
                <CoverageBar status={splitStatus} />
                {showPageOneHint && (
                  <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    <p>
                      <Trans>
                        The book's title and metadata arrive with the part that
                        contains page 1 — merge that part to fill them in.
                      </Trans>
                    </p>
                  </div>
                )}
              </div>
            )}
          <div className="relative grid grid-cols-1 items-stretch gap-px bg-border/60 md:grid-cols-2">
            <ExportPart bookLabel={bookLabel} pageCount={pageCount} spreadMode={spreadMode} status={splitStatus} />
            <MergePart bookLabel={bookLabel} status={splitStatus} />
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
                <ArrowRight className="h-3.5 w-3.5 rotate-90 md:rotate-0" strokeWidth={2} />
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * Placeholder shown while the part/split queries load, sized to roughly match
 * the two-column export/merge grid so the card doesn't jump once data arrives.
 */
function PartsPanelSkeleton() {
  return (
    <div
      className="grid animate-pulse grid-cols-1 gap-px bg-border/60 md:grid-cols-2"
      aria-hidden
    >
      {[0, 1].map((col) => (
        <div key={col} className="flex flex-col gap-3 bg-card p-6">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted/70" />
          <div className="h-3 w-4/5 rounded bg-muted/70" />
          <div className="mt-2 h-9 w-40 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Merge coverage — which pages are present (merged) vs still missing.
// Shown inside the "Merge a completed part" section once a split has started.
// ---------------------------------------------------------------------------

function MergeCoverage({ status }: { status: SplitStatus | undefined }) {
  // Only meaningful once a split has begun (parts exported and/or merged).
  if (!status || status.pageCount === 0) return null
  if (status.mergedRanges.length === 0 && status.exported.length === 0) return null

  if (status.fullyMerged) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <Trans>All {status.pageCount} pages merged in</Trans>
      </span>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {status.mergedRanges.length > 0 && (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <Trans>Imported:</Trans>
          <span className="font-medium tabular-nums text-foreground">
            {status.mergedRanges.map(fmtRange).join(", ")}
          </span>
        </span>
      )}
      {status.missingRanges.length > 0 && (
        <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          <Trans>Missing:</Trans>
          <span className="font-medium tabular-nums">
            {status.missingRanges.map(fmtRange).join(", ")}
          </span>
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export a part
// ---------------------------------------------------------------------------

function ExportPart({
  bookLabel,
  pageCount,
  spreadMode,
  status,
}: {
  bookLabel: string
  pageCount: number
  spreadMode: boolean
  status: SplitStatus | undefined
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const state = useExportPartState({ bookLabel, pageCount, spreadMode, status })

  return (
    <div className="flex flex-col gap-4 bg-card p-6">
      <ExportPartControls state={state} pageCount={pageCount} status={status} />

      {pageCount > 0 && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setPreviewOpen(true)}
        >
          <Scissors className="mr-1.5 h-4 w-4" />
          <Trans>See the book & pick pages</Trans>
        </Button>
      )}

      <SplitPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        bookLabel={bookLabel}
        pageCount={pageCount}
        status={status}
        state={state}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Merge a completed part
// ---------------------------------------------------------------------------

function MergePart({ bookLabel, status }: { bookLabel: string; status: SplitStatus | undefined }) {
  const { t } = useLingui()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [acknowledge, setAcknowledge] = useState(false)
  const [result, setResult] = useState<MergeResult | null>(null)
  const [selectError, setSelectError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // Lets the user reopen the picker to merge again after the book is complete.
  const [mergeAnother, setMergeAnother] = useState(false)

  const previewMutation = usePreviewMerge(bookLabel)
  const mergeMutation = useMergePart(bookLabel)
  const regenerateSummary = useRegenerateBookSummary()
  const { apiKey, hasApiKey } = useApiKey()

  const reset = () => {
    setFile(null)
    setPreview(null)
    setAcknowledge(false)
    setResult(null)
    setSelectError(null)
    setMergeAnother(false)
    previewMutation.reset()
    mergeMutation.reset()
    if (fileRef.current) fileRef.current.value = ""
  }

  const onSelectFile = (selected: File | null) => {
    setPreview(null)
    setResult(null)
    setAcknowledge(false)
    setSelectError(null)
    previewMutation.reset()
    mergeMutation.reset()
    if (selected && !isZipFile(selected)) {
      setFile(null)
      setSelectError(t`Select a .zip project archive exported from ADT Studio.`)
      if (fileRef.current) fileRef.current.value = ""
      return
    }
    setFile(selected)
    if (selected) {
      previewMutation.mutate(selected, {
        onSuccess: (p) => setPreview(p),
        // A bad part clears the picker (the dropzone returns to its empty state)
        // while the error stays visible, so the user can drop another file.
        onError: () => {
          setFile(null)
          if (fileRef.current) fileRef.current.value = ""
        },
      })
    }
  }

  const onMerge = () => {
    if (!file) return
    mergeMutation.mutate(
      { zip: file, acknowledge },
      { onSuccess: (r) => setResult(r) },
    )
  }

  const needsAck = preview && !preview.blocked && !preview.semanticsMatch
  const canMerge = preview && !preview.blocked && (!needsAck || acknowledge)
  const previewError = useFriendlyArchiveError(
    previewMutation.error instanceof Error ? previewMutation.error.message : null,
  )
  const mergeError = useFriendlyArchiveError(
    mergeMutation.error instanceof Error ? mergeMutation.error.message : null,
  )

  // A split book with every page merged back is done — show that plainly
  // instead of an empty picker, but let the user reopen it to re-merge.
  const showCompletion =
    !!status &&
    status.exported.length > 0 &&
    status.fullyMerged &&
    !file &&
    !mergeAnother

  return (
    <div className="flex flex-col gap-4 bg-card p-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Combine className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
          <h3 className="text-sm font-semibold text-foreground">
            <Trans>Merge a completed part</Trans>
          </h3>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <Trans>
            Upload a completed part (exported as a project). Per-page results are
            copied in as new versions; book-level stages are marked for re-running.
          </Trans>
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
      />

      <div className="flex flex-1 flex-col">
      {showCompletion ? (
        <StatusPanel tone="success" className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <Trans>This book is fully assembled</Trans>
          </div>
          <p className="text-xs text-muted-foreground">
            <Trans>
              Every page has been merged back from its part — the whole book is
              in place.
            </Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setMergeAnother(true)}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            <Trans>Merge another part</Trans>
          </Button>
        </StatusPanel>
      ) : result ? (
        <StatusPanel tone="success" className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              <Trans>Merged</Trans> ·{" "}
              <Plural
                value={result.addedPages}
                one="# page added"
                other="# pages added"
              />
              ,{" "}
              <Plural
                value={result.replacedPages}
                one="# page replaced"
                other="# pages replaced"
              />
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            <Trans>
              Re-run these book-level stages on the assembled book:
            </Trans>{" "}
            <span className="font-medium text-foreground">{result.staleSteps.join(", ")}</span>
          </p>

          {result.metadataMerged && (
            <p className="text-xs text-muted-foreground">
              <Trans>
                Book metadata (title, authors, publisher) was taken from this
                part and now appears in the Extract step, where you can edit it.
              </Trans>
            </p>
          )}

          {result.bookSummaryStale && (
            <StatusPanel tone="warning" className="flex flex-col gap-1.5">
              <p className="text-xs text-amber-900 dark:text-amber-200">
                <Trans>
                  The book summary covers the whole book — regenerate it on the
                  assembled book once you've merged your last part.
                </Trans>
              </p>
              {regenerateSummary.isSuccess ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <Trans>Book summary regeneration queued</Trans>
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={!hasApiKey || regenerateSummary.isPending}
                  title={!hasApiKey ? t`Set your API key first` : undefined}
                  onClick={() => regenerateSummary.mutate({ label: bookLabel, apiKey })}
                >
                  {regenerateSummary.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-4 w-4" />
                  )}
                  <Trans>Regenerate book summary</Trans>
                </Button>
              )}
            </StatusPanel>
          )}

          <MergeCoverage status={status} />

          <Button type="button" variant="outline" size="sm" className="self-start" onClick={reset}>
            <Trans>Merge another</Trans>
          </Button>
        </StatusPanel>
      ) : (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              onSelectFile(e.dataTransfer.files?.[0] ?? null)
            }}
          >
            {file ? (
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-3",
                  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
                  dragOver ? "border-part bg-part/5" : "border-border bg-muted/20",
                )}
              >
                <FileArchive className="h-5 w-5 shrink-0 text-part" strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground" title={file.name}>
                  {file.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => fileRef.current?.click()}
                >
                  <Trans>Change</Trans>
                </Button>
                <button
                  type="button"
                  onClick={reset}
                  aria-label={t`Remove file`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "flex min-h-[150px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center",
                  "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  dragOver
                    ? "border-part bg-part/5"
                    : "border-border hover:border-part/50 hover:bg-muted/30",
                )}
              >
                <Upload
                  className={cn("h-6 w-6", dragOver ? "text-part" : "text-muted-foreground")}
                  strokeWidth={2}
                />
                <span className="text-xs text-muted-foreground">
                  <Trans>
                    Drop a part <span className="font-medium text-foreground">.zip</span> here, or
                    browse
                  </Trans>
                </span>
              </button>
            )}
          </div>

          <Collapsible shown={previewMutation.isPending}>
            <p className="flex items-center gap-2 pt-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              <Trans>Analyzing part…</Trans>
            </p>
          </Collapsible>

          <Collapsible shown={!!selectError}>
            {selectError && <div className="pt-3"><ErrorNote message={selectError} /></div>}
          </Collapsible>

          <Collapsible shown={!!previewError}>
            {previewError && (
              <div className="pt-3"><ErrorNote message={previewError.title} hint={previewError.hint} /></div>
            )}
          </Collapsible>

          <Collapsible shown={!!preview}>
            {preview && <div className="pt-3"><PreviewSummary preview={preview} /></div>}
          </Collapsible>

          <Collapsible shown={!!needsAck}>
            {needsAck && (
              <label className="flex items-start gap-2 pt-3 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <Trans>
                    I understand the part was processed with different
                    prompts/models and want to merge it anyway.
                  </Trans>
                </span>
              </label>
            )}
          </Collapsible>

          <Collapsible shown={!!mergeError}>
            {mergeError && (
              <div className="pt-3"><ErrorNote message={mergeError.title} hint={mergeError.hint} /></div>
            )}
          </Collapsible>

          <Collapsible shown={!!preview}>
            {preview && (
              <div className="pt-3">
                <Button
                  type="button"
                  disabled={!canMerge || mergeMutation.isPending}
                  onClick={onMerge}
                  title={preview.blocked ? t`This part cannot be merged` : undefined}
                >
                  <Combine className="mr-1.5 h-4 w-4" />
                  {mergeMutation.isPending ? <Trans>Merging…</Trans> : <Trans>Merge part</Trans>}
                </Button>
              </div>
            )}
          </Collapsible>
        </>
      )}
      </div>
    </div>
  )
}

function PreviewSummary({ preview }: { preview: MergePreview }) {
  return (
    <StatusPanel tone="info" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
        <span>
          <Trans>
            Pages {preview.range.startPage}–{preview.range.endPage}
          </Trans>
        </span>
        <span className="text-emerald-700 dark:text-emerald-400">
          <Plural
            value={preview.addedPageNumbers.length}
            one="# page added"
            other="# pages added"
          />
        </span>
        {preview.replacedPageNumbers.length > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            <Plural
              value={preview.replacedPageNumbers.length}
              one="# page replaced"
              other="# pages replaced"
            />
          </span>
        )}
      </div>

      {preview.blocked && preview.blockReason && (
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{preview.blockReason}</span>
        </div>
      )}

      {!preview.blocked &&
        preview.warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{w}</span>
          </div>
        ))}

      {preview.coverage.length > 0 && (
        <p className="text-muted-foreground">
          <Trans>Includes:</Trans>{" "}
          {preview.coverage.map((c) => `${c.node} (${c.pages})`).join(", ")}
        </p>
      )}
    </StatusPanel>
  )
}

const STATUS_TONES = {
  success: "border-emerald-500/30 bg-emerald-500/5",
  warning: "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
  error: "border-destructive/30 bg-destructive/5 text-destructive",
  info: "border-border bg-muted/20",
} as const

/**
 * Shared surface for the panel's result / preview / warning / error blocks so
 * they share one elevation + radius language and fade in consistently when they
 * appear, instead of each defining its own border/bg combo.
 */
function StatusPanel({
  tone,
  className,
  children,
}: {
  tone: keyof typeof STATUS_TONES
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-xs",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200",
        STATUS_TONES[tone],
        className,
      )}
    >
      {children}
    </div>
  )
}

function ErrorNote({ message, hint }: { message: string; hint?: string }) {
  return (
    <StatusPanel tone="error" className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{message}</span>
        {hint && <span className="text-destructive/80">{hint}</span>}
      </span>
    </StatusPanel>
  )
}
