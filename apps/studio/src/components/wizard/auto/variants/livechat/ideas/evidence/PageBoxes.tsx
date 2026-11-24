import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileText } from "lucide-react"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { PageViewer } from "../../../chat/Evidence"
import "./evidence.css"

export type BoxClaim = { label: string; page: number }

function Boxed({ file, claim, index, onOpen }: { file: File; claim: BoxClaim; index: number; onOpen: () => void }) {
  const { t } = useLingui()
  const src = usePageThumb(file, claim.page, 200)
  return (
    <button type="button" onClick={onOpen} aria-label={t`${claim.label}: page ${claim.page}. Show it larger`} className="group flex flex-col items-center gap-3 rounded-[12px] p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500" style={{ ["--ev-delay" as string]: `${index * 0.35}s` }}>
      <span className="relative grid h-[132px] w-[100px] place-items-center">
        {src ? <img src={src} alt="" className="max-h-full max-w-full rounded-[3px] shadow-[0_8px_20px_-10px_rgba(15,23,42,0.5)] transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none" /> : <span className="grid size-full place-items-center rounded-[3px] bg-muted"><FileText className="size-5 text-muted-foreground/50" /></span>}
        {/* The reading names pages, not spots on them, so the box is the whole page. */}
        <svg aria-hidden className="pointer-events-none absolute -inset-[5px] size-[calc(100%+10px)] overflow-visible" viewBox="0 0 110 142" preserveAspectRatio="none">
          <rect className="ev-box" x="1.5" y="1.5" width="107" height="139" rx="6" pathLength={100} />
        </svg>
        <span aria-hidden className="ev-box-tag absolute -top-2.5 left-1 max-w-[150px] truncate rounded-[6px] bg-brand-600 px-1.5 py-0.5 text-[10.5px] font-semibold text-primary-foreground shadow-sm">
          {claim.label}
        </span>
      </span>
      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground group-hover:text-foreground">
        <Trans>p. {claim.page}</Trans>
      </span>
    </button>
  )
}

/**
 * Proof drawn on the page: for each thing the assistant found, one page with an outline drawn
 * around it and a small label. The engine says which pages show a thing but not where on them, so
 * the outline goes around the whole page, and says so.
 */
export function PageBoxes({ file, claims }: { file: File | null | undefined; claims: BoxClaim[] }) {
  const [viewer, setViewer] = useState<number | null>(null)
  if (!file || claims.length === 0) return null
  const pages = [...new Set(claims.map((c) => c.page))]
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-3 pt-2">
        {claims.map((c, i) => (
          <Boxed key={`${c.label}-${c.page}`} file={file} claim={c} index={i} onOpen={() => setViewer(c.page)} />
        ))}
      </div>
      <p className="text-[12.5px] leading-snug text-muted-foreground">
        <Trans>Whole pages: the reading names pages, not spots.</Trans>
      </p>
      <PageViewer file={file} pages={pages} page={viewer} onPage={setViewer} />
    </div>
  )
}
