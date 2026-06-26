import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { Download, CheckCircle2 } from "lucide-react"
import { api, type PageRange, type SplitStatus } from "../../api/client"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Badge } from "../ui/badge"
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
  } = state

  return (
    <div className="flex flex-col gap-3">
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
