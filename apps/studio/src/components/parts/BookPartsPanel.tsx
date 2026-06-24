import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { Scissors, Combine, Download, Upload, AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react"
import { useBook, useRegenerateBookSummary } from "../../hooks/use-books"
import { usePartInfo, usePreviewMerge, useMergePart, useSplitStatus } from "../../hooks/use-parts"
import { useApiKey } from "../../hooks/use-api-key"
import { useActiveConfig } from "../../hooks/use-debug"
import { useSourcePdfInfo } from "../../hooks/use-source-pdf-info"
import { api, type MergePreview, type MergeResult, type PageRange, type SplitStatus } from "../../api/client"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Badge } from "../ui/badge"

const fmtRange = (r: PageRange) =>
  r.startPage === r.endPage ? `${r.startPage}` : `${r.startPage}–${r.endPage}`

const rangeKey = (r: PageRange) => `${r.startPage}-${r.endPage}`

/**
 * Split `1..pageCount` into `n` contiguous, roughly-equal page windows (sizes
 * differ by at most one page). In `spreadMode` the split is computed in
 * two-page-spread units — assuming spreads pair as (1,2), (3,4), … — so a
 * window never splits a spread; each window then starts on an odd page and
 * ends on an even one. These are starting suggestions the coordinator can
 * still adjust per export.
 */
export function computeEqualWindows(
  pageCount: number,
  n: number,
  opts: { spreadMode?: boolean } = {},
): PageRange[] {
  if (pageCount <= 0 || n <= 0) return []

  if (opts.spreadMode) {
    const spreads = Math.ceil(pageCount / 2) // spread i covers pages [2i+1, 2i+2]
    const parts = Math.min(n, spreads)
    const base = Math.floor(spreads / parts)
    const remainder = spreads % parts
    const windows: PageRange[] = []
    let spreadStart = 0
    for (let i = 0; i < parts; i++) {
      const count = base + (i < remainder ? 1 : 0)
      const startPage = spreadStart * 2 + 1
      const endPage = Math.min((spreadStart + count) * 2, pageCount)
      windows.push({ startPage, endPage })
      spreadStart += count
    }
    return windows
  }

  const parts = Math.min(n, pageCount)
  const base = Math.floor(pageCount / parts)
  const remainder = pageCount % parts
  const windows: PageRange[] = []
  let start = 1
  for (let i = 0; i < parts; i++) {
    const size = base + (i < remainder ? 1 : 0)
    const end = Math.min(start + size - 1, pageCount)
    windows.push({ startPage: start, endPage: end })
    start = end + 1
  }
  return windows
}

/**
 * Split a book into page-range "parts" for independent processing, and merge
 * completed parts back in. Surfaced on the book overview page.
 */
export function BookPartsPanel({ bookLabel }: { bookLabel: string }) {
  const { data: book } = useBook(bookLabel)
  const { data: partInfo } = usePartInfo(bookLabel)
  const { data: pdfInfo } = useSourcePdfInfo(bookLabel)
  const { data: splitStatus } = useSplitStatus(bookLabel)
  const { data: activeConfig } = useActiveConfig(bookLabel)
  const spreadMode = activeConfig?.merged?.spread_mode === true
  // Base the export range on the full source PDF (works before extraction and
  // isn't capped when the book was extracted with a window). Fall back to the
  // extracted page count.
  const pageCount = splitStatus?.pageCount ?? pdfInfo?.pageCount ?? book?.pageCount ?? 0

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
        <ExportPart bookLabel={bookLabel} pageCount={pageCount} spreadMode={spreadMode} status={splitStatus} />
        <MergePart bookLabel={bookLabel} status={splitStatus} />
      </div>
    </section>
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
        <Trans>All {status.pageCount} parts merged in</Trans>
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
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [startPage, setStartPage] = useState(1)
  const [endPage, setEndPage] = useState(pageCount > 0 ? pageCount : 1)
  // While false, the picker auto-follows the next un-exported window (the equal-
  // parts plan if one is set, otherwise the next gap). Manual edits pin it;
  // exporting releases it so it advances.
  const [touched, setTouched] = useState(false)
  // Optional "split into N equal parts" plan. When set, the picker walks these
  // windows in order, skipping ones already exported.
  const [partsInput, setPartsInput] = useState("")
  const [plan, setPlan] = useState<PageRange[] | null>(null)

  const nextGap = status?.nextGap
  const nextGapKey = nextGap ? `${nextGap.startPage}-${nextGap.endPage}` : ""
  const exportedKey = (status?.exported ?? []).map(rangeKey).join(",")

  // Default the picker to the next un-exported window. With a plan, that's the
  // first plan window not yet exported; otherwise the next gap (e.g. after
  // exporting 1–10, jump to 11–N).
  useEffect(() => {
    if (touched) return
    if (plan && plan.length > 0) {
      const exported = new Set(exportedKey ? exportedKey.split(",") : [])
      const next = plan.find((w) => !exported.has(rangeKey(w))) ?? plan[plan.length - 1]
      setStartPage(next.startPage)
      setEndPage(next.endPage)
      return
    }
    if (nextGap) {
      setStartPage(nextGap.startPage)
      setEndPage(nextGap.endPage)
    } else if (pageCount > 0 && !status) {
      // Status not loaded yet — fall back to the whole book.
      setStartPage(1)
      setEndPage(pageCount)
    }
  }, [nextGapKey, pageCount, touched, status, nextGap, plan, exportedKey])

  const onPartsChange = (raw: string) => {
    setPartsInput(raw)
    const n = Number(raw.trim())
    if (raw.trim() && Number.isInteger(n) && n >= 2 && pageCount > 0) {
      setPlan(computeEqualWindows(pageCount, n, { spreadMode }))
      setTouched(false)
    } else {
      setPlan(null)
    }
  }

  const max = pageCount > 0 ? pageCount : undefined
  const invalid = startPage < 1 || endPage < startPage || (max !== undefined && endPage > max)

  const onExport = () => {
    api.exportPart(bookLabel, startPage, endPage)
    // Release the pin so the picker follows the next gap, and refresh the
    // ledger once the download request has recorded the export server-side.
    setTouched(false)
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "split-status"] })
    }, 1200)
  }

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

      {pageCount > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Trans>Split into</Trans>
            </span>
            <Input
              type="number"
              min={2}
              max={pageCount}
              placeholder="N"
              value={partsInput}
              onChange={(e) => onPartsChange(e.target.value)}
              className="w-16 tabular-nums"
            />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Trans>equal parts</Trans>
            </span>
          </label>
          {plan && plan.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {plan.map((w) => {
                const done = (status?.exported ?? []).some((r) => rangeKey(r) === rangeKey(w))
                return (
                  <Badge
                    key={rangeKey(w)}
                    variant={done ? "secondary" : "outline"}
                    className="text-[10px] px-1.5 py-0 tabular-nums"
                  >
                    {done && <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />}
                    {fmtRange(w)}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>
      )}

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
            onChange={(e) => { setStartPage(Number(e.target.value)); setTouched(true) }}
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
            onChange={(e) => { setEndPage(Number(e.target.value)); setTouched(true) }}
            className="w-24 tabular-nums"
          />
        </label>
        <Button
          type="button"
          disabled={invalid}
          onClick={onExport}
          title={invalid ? t`Enter a valid page range` : undefined}
        >
          <Download className="mr-1.5 h-4 w-4" />
          <Trans>Download part</Trans>
        </Button>
      </div>

      {status && status.exported.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {status.fullySplit ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <Trans>The whole book has been split into parts.</Trans>
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              <Trans>Not yet split:</Trans>{" "}
              <span className="font-medium text-foreground tabular-nums">
                {status.exportGaps.map(fmtRange).join(", ")}
              </span>
            </span>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-muted-foreground"><Trans>Exported:</Trans></span>
            {status.exported.map((r) => (
              <Badge key={`${r.startPage}-${r.endPage}`} variant="secondary" className="text-[10px] px-1.5 py-0 tabular-nums">
                {fmtRange(r)}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {pageCount > 0 && (!status || status.exported.length === 0) && (
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

function MergePart({ bookLabel, status }: { bookLabel: string; status: SplitStatus | undefined }) {
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
            <div className="flex flex-col gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
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
            </div>
          )}

          <MergeCoverage status={status} />

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

          <MergeCoverage status={status} />

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
