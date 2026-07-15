import { useEffect, useId, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { Download, CheckCircle2, Scissors, SlidersHorizontal } from "lucide-react"
import { api, type PageRange, type SplitStatus } from "../../api/client"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { SegmentedControl } from "../ui/segmented-control"
import { StepperField } from "../ui/stepper-input"
import { PageRangeField } from "../ui/page-range-field"
import { Collapsible } from "../ui/collapsible"
import { cn } from "../../lib/utils"
import { computeEqualWindows, fmtRange, rangeKey } from "./parts-utils"

export interface ExportPartState {
  startPage: number
  endPage: number
  setStartPage: (n: number) => void
  setEndPage: (n: number) => void
  setTouched: (touched: boolean) => void
  partsInput: string
  onPartsChange: (raw: string) => void
  plan: PageRange[] | null
  invalid: boolean
  max: number | undefined
  onExport: () => void
  /** Which input mode the controls show. Lifted here so the inline card and the
   *  preview dialog (sharing one state) keep the same toggle. */
  mode: "split" | "custom"
  setMode: (mode: "split" | "custom") => void
}

/**
 * State + handlers for exporting a part: the equal-parts plan, the From/To
 * picker (which auto-follows the next un-exported window until manually
 * touched), and the download action. Lifted into a hook so the inline panel
 * and the full-screen split preview can share a single instance — edits in the
 * modal stay in sync with the panel behind it.
 */
export function useExportPartState({
  bookLabel,
  pageCount,
  spreadMode,
  status,
}: {
  bookLabel: string
  pageCount: number
  spreadMode: boolean
  status: SplitStatus | undefined
}): ExportPartState {
  const queryClient = useQueryClient()
  const [startPage, setStartPage] = useState(1)
  const [endPage, setEndPage] = useState(pageCount > 0 ? pageCount : 1)
  // While false, the picker auto-follows the next un-exported window (the equal-
  // parts plan if one is set, otherwise the next gap). Manual edits pin it;
  // exporting releases it so it advances.
  const [touched, setTouched] = useState(false)
  const [mode, setMode] = useState<"split" | "custom">("split")
  // "Split into N equal parts" — defaults to 2 so the user lands on a sensible
  // split. The plan is derived so it recomputes once the page count loads.
  const [partsInput, setPartsInput] = useState("2")
  const plan = useMemo(() => {
    const n = Number(partsInput.trim())
    if (partsInput.trim() && Number.isInteger(n) && n >= 2 && pageCount > 0) {
      return computeEqualWindows(pageCount, n, { spreadMode })
    }
    return null
  }, [partsInput, pageCount, spreadMode])

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
    // Release the pin so the picker follows the freshly-computed windows.
    if (raw.trim() && Number.isInteger(n) && n >= 2 && pageCount > 0) setTouched(false)
  }

  const max = pageCount > 0 ? pageCount : undefined
  const invalid = startPage < 1 || endPage < startPage || (max !== undefined && endPage > max)

  const onExport = async () => {
    const before = (status?.exported ?? []).length
    api.exportPart(bookLabel, startPage, endPage)
    // Release the pin so the picker follows the next gap, then poll the
    // split-status until the server has recorded the export (a single fixed
    // delay races a slow disk / large PDF). Refresh the books list too — the
    // library card's split badge is a separate query.
    setTouched(false)
    const statusKey = ["books", bookLabel, "split-status"]
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 400 + attempt * 200))
      await queryClient.refetchQueries({ queryKey: statusKey, exact: true })
      const next = queryClient.getQueryData<SplitStatus>(statusKey)
      if ((next?.exported.length ?? 0) > before) break
    }
    queryClient.invalidateQueries({ queryKey: ["books"], exact: true })
  }

  return {
    startPage,
    endPage,
    setStartPage,
    setEndPage,
    setTouched,
    partsInput,
    onPartsChange,
    plan,
    invalid,
    max,
    onExport,
    mode,
    setMode,
  }
}

/**
 * The "Export a part" form: equal-parts splitter, From/To page picker, download
 * button and exported-status summary. Presentation only — all state lives in
 * the {@link ExportPartState} passed in, so it can be rendered both inline on
 * the book overview and inside the split-preview dialog.
 */
export function ExportPartControls({
  state,
  pageCount,
  status,
}: {
  state: ExportPartState
  pageCount: number
  status: SplitStatus | undefined
}) {
  const { t } = useLingui()
  const errorId = useId()
  const [announce, setAnnounce] = useState("")
  const {
    startPage,
    endPage,
    setStartPage,
    setEndPage,
    setTouched,
    partsInput,
    onPartsChange,
    plan,
    invalid,
    max,
    onExport,
    mode,
    setMode,
  } = state

  // Window chips drive the canonical From/To range — picking one pins it (so the
  // auto-advance effect won't override) and announces the change for SR users.
  const selectWindow = (w: PageRange) => {
    setStartPage(w.startPage)
    setEndPage(w.endPage)
    setTouched(true)
    setAnnounce(t`Selected pages ${fmtRange(w)}.`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
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
      </div>

      {pageCount > 0 && (
        <div className="flex flex-col gap-4">
          <SegmentedControl
            options={[
              { value: "split", label: t`Split into parts`, icon: <Scissors className="h-3.5 w-3.5" /> },
              { value: "custom", label: t`Custom range`, icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
            ]}
            value={mode}
            onValueChange={setMode}
            color="var(--color-part)"
          />

          {mode === "split" ? (
            <div key="split" className="flex flex-col gap-3">
              <div className="flex items-end gap-3">
                <StepperField
                  label={t`Split into`}
                  value={partsInput === "" ? null : Number(partsInput)}
                  min={2}
                  max={pageCount}
                  widthClass="w-28"
                  onValueChange={(n) => onPartsChange(n == null ? "" : String(n))}
                />
                <p className="mb-2.5 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                  <Trans>Divide the book into equal windows, then export each to hand out.</Trans>
                </p>
              </div>

              <Collapsible shown={!!plan && plan.length > 0}>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Trans>Windows</Trans>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t`Windows`}>
                    {(plan ?? []).map((w, i) => {
                      const done = (status?.exported ?? []).some((r) => rangeKey(r) === rangeKey(w))
                      const active = w.startPage === startPage && w.endPage === endPage
                      return (
                        <button
                          key={rangeKey(w)}
                          type="button"
                          aria-pressed={active}
                          onClick={() => selectWindow(w)}
                          style={{ animationDelay: `${i * 30}ms` }}
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] tabular-nums",
                            "transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-95",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95",
                            active
                              ? "border-part bg-part/10 font-medium text-part"
                              : done
                                ? "border-transparent bg-muted text-muted-foreground hover:bg-muted/70"
                                : "border-border text-foreground hover:border-part/50 hover:bg-muted/40",
                          )}
                        >
                          {done && <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />}
                          {fmtRange(w)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </Collapsible>
            </div>
          ) : (
            <div key="custom" className="flex flex-col gap-2">
              <PageRangeField
                value={[startPage, endPage]}
                min={1}
                max={max}
                invalid={invalid}
                errorId={errorId}
                onChange={([s, e]) => { setStartPage(s); setEndPage(e); setTouched(true) }}
              />
              <Collapsible shown={invalid}>
                <p id={errorId} role="alert" className="text-[11px] font-medium text-destructive">
                  <Trans>Enter a valid page range within 1–{pageCount}.</Trans>
                </p>
              </Collapsible>
            </div>
          )}

          {/* What's about to be exported, and the action. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Trans>Exporting</Trans>
              </span>
              <span className="text-sm font-medium tabular-nums text-foreground">
                {invalid ? (
                  <span className="text-destructive"><Trans>Invalid range</Trans></span>
                ) : (
                  <>
                    <Trans>Pages {fmtRange({ startPage, endPage })}</Trans>
                    <span className="font-normal text-muted-foreground">
                      {" · "}
                      <Plural value={Math.max(0, endPage - startPage + 1)} one="# page" other="# pages" />
                    </span>
                  </>
                )}
              </span>
            </div>
            <Button
              type="button"
              disabled={invalid}
              onClick={onExport}
              aria-describedby={invalid ? errorId : undefined}
            >
              <Download className="mr-1.5 h-4 w-4" />
              <Trans>Download part</Trans>
            </Button>
          </div>

          <span className="sr-only" aria-live="polite">{announce}</span>
        </div>
      )}

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

