import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Scissors, Combine, Download, Upload, AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react"
import { useBook, useRegenerateBookSummary } from "../../hooks/use-books"
import { usePartInfo, usePreviewMerge, useMergePart } from "../../hooks/use-parts"
import { useApiKey } from "../../hooks/use-api-key"
import { api, type MergePreview, type MergeResult } from "../../api/client"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Badge } from "../ui/badge"

/**
 * Split a book into page-range "parts" for independent processing, and merge
 * completed parts back in. Surfaced on the book overview page.
 */
export function BookPartsPanel({ bookLabel }: { bookLabel: string }) {
  const { data: book } = useBook(bookLabel)
  const { data: partInfo } = usePartInfo(bookLabel)
  const pageCount = book?.pageCount ?? 0

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-6 py-4">
        <Scissors className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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

      <div className="grid grid-cols-1 gap-px bg-border/60 md:grid-cols-2">
        <ExportPart bookLabel={bookLabel} pageCount={pageCount} />
        <MergePart bookLabel={bookLabel} />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Export a part
// ---------------------------------------------------------------------------

function ExportPart({ bookLabel, pageCount }: { bookLabel: string; pageCount: number }) {
  const { t } = useLingui()
  const [startPage, setStartPage] = useState(1)
  const [endPage, setEndPage] = useState(pageCount > 0 ? pageCount : 1)

  // Default the end page to the last page once the book detail loads.
  useEffect(() => {
    if (pageCount > 0) setEndPage((prev) => (prev === 1 ? pageCount : prev))
  }, [pageCount])

  const max = pageCount > 0 ? pageCount : undefined
  const invalid = startPage < 1 || endPage < startPage || (max !== undefined && endPage > max)

  return (
    <div className="flex flex-col gap-3 bg-card p-6">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        <h3 className="text-sm font-semibold text-foreground">
          <Trans>Export a part</Trans>
        </h3>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <Trans>
          Download a lightweight part (the full PDF plus a page range and a
          fingerprint) for someone else to process on their own machine, then
          merge their result back here.
        </Trans>
      </p>

      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Trans>From page</Trans>
          </span>
          <Input
            type="number"
            min={1}
            max={max}
            value={startPage}
            onChange={(e) => setStartPage(Number(e.target.value))}
            className="w-24 tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Trans>To page</Trans>
          </span>
          <Input
            type="number"
            min={1}
            max={max}
            value={endPage}
            onChange={(e) => setEndPage(Number(e.target.value))}
            className="w-24 tabular-nums"
          />
        </label>
        <Button
          type="button"
          disabled={invalid}
          onClick={() => api.exportPart(bookLabel, startPage, endPage)}
          title={invalid ? t`Enter a valid page range` : undefined}
        >
          <Download className="mr-1.5 h-4 w-4" />
          <Trans>Download part</Trans>
        </Button>
      </div>
      {pageCount > 0 && (
        <p className="text-[11px] text-muted-foreground tabular-nums">
          <Trans>This book has {pageCount} pages.</Trans>
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Merge a completed part
// ---------------------------------------------------------------------------

function MergePart({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [acknowledge, setAcknowledge] = useState(false)
  const [result, setResult] = useState<MergeResult | null>(null)

  const previewMutation = usePreviewMerge(bookLabel)
  const mergeMutation = useMergePart(bookLabel)
  const regenerateSummary = useRegenerateBookSummary()
  const { apiKey, hasApiKey } = useApiKey()

  const reset = () => {
    setFile(null)
    setPreview(null)
    setAcknowledge(false)
    setResult(null)
    previewMutation.reset()
    mergeMutation.reset()
    if (fileRef.current) fileRef.current.value = ""
  }

  const onSelectFile = (selected: File | null) => {
    setPreview(null)
    setResult(null)
    setAcknowledge(false)
    mergeMutation.reset()
    setFile(selected)
    if (selected) {
      previewMutation.mutate(selected, { onSuccess: (p) => setPreview(p) })
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
  const previewError =
    previewMutation.error instanceof Error ? previewMutation.error.message : null
  const mergeError =
    mergeMutation.error instanceof Error ? mergeMutation.error.message : null

  return (
    <div className="flex flex-col gap-3 bg-card p-6">
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

      <input
        ref={fileRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
      />

      {result ? (
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <Trans>
              Merged · {result.addedPages} added, {result.replacedPages} replaced
            </Trans>
          </div>
          <p className="text-xs text-muted-foreground">
            <Trans>
              Re-run these book-level stages on the assembled book:
            </Trans>{" "}
            <span className="font-medium text-foreground">{result.staleSteps.join(", ")}</span>
          </p>

          {result.bookSummaryStale && (
            <div className="flex flex-col gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
              <p className="text-xs text-amber-800 dark:text-amber-300">
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
            </div>
          )}

          <Button type="button" variant="outline" size="sm" className="self-start" onClick={reset}>
            <Trans>Merge another</Trans>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              <Trans>Choose part file…</Trans>
            </Button>
            {file && (
              <span className="truncate text-xs text-muted-foreground" title={file.name}>
                {file.name}
              </span>
            )}
          </div>

          {previewMutation.isPending && (
            <p className="text-xs text-muted-foreground">
              <Trans>Analyzing part…</Trans>
            </p>
          )}
          {previewError && <ErrorNote message={previewError} />}

          {preview && <PreviewSummary preview={preview} />}

          {needsAck && (
            <label className="flex items-start gap-2 text-xs text-foreground">
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

          {mergeError && <ErrorNote message={mergeError} />}

          {preview && (
            <Button
              type="button"
              disabled={!canMerge || mergeMutation.isPending}
              onClick={onMerge}
              title={preview.blocked ? t`This part cannot be merged` : undefined}
              className="self-start"
            >
              <Combine className="mr-1.5 h-4 w-4" />
              {mergeMutation.isPending ? <Trans>Merging…</Trans> : <Trans>Merge part</Trans>}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function PreviewSummary({ preview }: { preview: MergePreview }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
        <span>
          <Trans>
            Pages {preview.range.startPage}–{preview.range.endPage}
          </Trans>
        </span>
        <span className="text-emerald-700 dark:text-emerald-400">
          <Trans>{preview.addedPageNumbers.length} added</Trans>
        </span>
        {preview.replacedPageNumbers.length > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            <Trans>{preview.replacedPageNumbers.length} replaced</Trans>
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
    </div>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
