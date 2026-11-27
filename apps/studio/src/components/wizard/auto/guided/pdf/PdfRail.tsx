import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { PdfDetails, type PdfProps } from "./parts"
import { PdfPages } from "./PdfPages"

/**
 * "Your book" beside the page on wide windows (1480px and up): the PDF in full, its actions and
 * every pick, always in view. Narrower windows show the row above the steps instead (Guided).
 */
export function PdfRail({ flow, picks, onEdit, locked }: PdfProps) {
  const [pagesOpen, setPagesOpen] = useState(false)
  if (!flow.file) return null
  return (
    <aside className="fixed left-5 top-[72px] z-30 hidden w-[240px] rounded-[20px] bg-card p-4 text-foreground shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] ring-1 ring-border animate-in fade-in slide-in-from-left-2 duration-300 motion-reduce:animate-none min-[1480px]:block">
      <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Trans>Your book</Trans>
      </p>
      <PdfDetails flow={flow} picks={picks} onEdit={onEdit} locked={locked} onSeePages={() => setPagesOpen(true)} stacked />
      <PdfPages file={flow.file} title={flow.title} pageCount={flow.pageCount} open={pagesOpen} onClose={() => setPagesOpen(false)} onChange={() => { setPagesOpen(false); flow.openPicker() }} locked={locked} />
    </aside>
  )
}
