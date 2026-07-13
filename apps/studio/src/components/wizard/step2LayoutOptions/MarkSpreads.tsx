import { useEffect, useState } from "react"
import { useStore } from "@tanstack/react-form"
import { BookOpen } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { getPresetAccent } from "@/components/wizard/constants"
import {
  getCachedPdfPageCount,
  getPdfPageCount,
} from "@/components/wizard/shared/pdfMetadata"
import { SpreadPickerDialog } from "@/components/spread-picker/SpreadPickerDialog"

function parsePositiveInt(raw: string): number | undefined {
  const n = Number(raw.trim())
  return raw.trim() && Number.isInteger(n) && n >= 1 ? n : undefined
}

export function MarkSpreads() {
  const form = useWizardForm()
  const { t } = useLingui()
  const pageGrouping = useStore(form.store, (s) => s.values.pageGrouping)
  const scope = useStore(form.store, (s) => s.values.scope)
  const selectedPreset = useStore(form.store, (s) => s.values.selectedPreset)
  const file = useStore(form.store, (s) => s.values.file)
  const startPageRaw = useStore(form.store, (s) => s.values.startPage)
  const endPageRaw = useStore(form.store, (s) => s.values.endPage)
  const spreadPairs = useStore(form.store, (s) => s.values.spreadPairs)

  const [open, setOpen] = useState(false)
  const [pageCount, setPageCount] = useState<number>(() =>
    file ? getCachedPdfPageCount(file) ?? 0 : 0,
  )

  useEffect(() => {
    if (!file) {
      setPageCount(0)
      return
    }
    const cached = getCachedPdfPageCount(file)
    if (cached !== undefined) {
      setPageCount(cached)
      return
    }
    let cancelled = false
    getPdfPageCount(file)
      .then((count) => {
        if (!cancelled) setPageCount(count)
      })
      .catch(() => {
        if (!cancelled) setPageCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [file])

  // Spreads only apply to a single-page base; split defers extraction entirely.
  if (pageGrouping !== "single" || scope === "split" || !file || pageCount === 0) {
    return null
  }

  const startPage = scope === "range" ? parsePositiveInt(startPageRaw) ?? 1 : 1
  const endPage =
    scope === "range" ? parsePositiveInt(endPageRaw) ?? pageCount : pageCount

  const markedPairs = spreadPairs
    .filter((p) => p >= startPage && p + 1 <= endPage)
    .sort((a, b) => a - b)
  const spreadCount = markedPairs.length
  const accent = getPresetAccent(selectedPreset)

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-4 transition-colors"
      style={{ borderColor: `${accent.bg}33`, backgroundColor: `${accent.bg}0d` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${accent.bg}1f`, color: accent.text }}
          >
            <BookOpen className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              <Trans>Does your book have any spreads?</Trans>
            </p>
            <p className="text-xs leading-relaxed text-[#737373]">
              <Trans>
                Single mode keeps each page separate. If a few illustrations
                actually span two facing pages, mark those pairs so they're kept
                together as spreads instead of being split down the middle.
              </Trans>
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setOpen(true)}
        >
          {spreadCount === 0 ? t`Mark spreads` : t`Edit spreads`}
        </Button>
      </div>

      {spreadCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-11">
          {markedPairs.map((lead) => (
            <span
              key={lead}
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums"
              style={{
                borderColor: `${accent.bg}55`,
                backgroundColor: `${accent.bg}14`,
                color: accent.text,
              }}
            >
              {lead}–{lead + 1}
            </span>
          ))}
        </div>
      )}

      <SpreadPickerDialog
        open={open}
        onOpenChange={setOpen}
        file={file}
        startPage={startPage}
        endPage={endPage}
        spreadPairs={spreadPairs}
        onChange={(next) => form.setFieldValue("spreadPairs", next)}
      />
    </div>
  )
}
