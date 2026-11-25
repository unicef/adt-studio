import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileText } from "lucide-react"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { PageViewer } from "../../../chat/Evidence"
import "./evidence.css"

export type BoxClaim = { label: string; page: number }

function Boxed({ file, claim, index, onOpen }: { file: File; claim: BoxClaim; index: number; onOpen: () => void }) {
  const { t } = useLingui()
  const src = usePageThumb(file, claim.page, 240)
  return (
    <button type="button" onClick={onOpen} aria-label={t`${claim.label}: page ${claim.page}. Show it larger`} className="group relative flex flex-col items-start rounded-[10px] pt-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500" style={{ ["--ev-delay" as string]: `${index * 0.5}s` }}>
      <span className="relative grid h-[168px] w-[128px] place-items-center rounded-[4px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.18),0_10px_22px_-12px_rgb(15_23_42/0.45)] transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none">
        {src ? <img src={src} alt="" className="max-h-full max-w-full rounded-[4px]" /> : <FileText className="size-5 text-muted-foreground/50" />}
        {/* The reading names pages, not spots on them, so the outline goes around the page's content. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 128 168" preserveAspectRatio="none">
          <rect className="ev-box" x="5" y="5" width="118" height="158" rx="4" pathLength={100} />
        </svg>
        <span aria-hidden className="ev-box-tag absolute -top-2.5 left-2 max-w-[180px] truncate rounded-[5px] bg-brand-600 px-1.5 py-px text-[11px] font-medium text-primary-foreground">
          {claim.label}
        </span>
        <span aria-hidden className="absolute bottom-1.5 right-1.5 rounded-[5px] bg-[var(--lc-bubble,var(--card))]/90 px-1.5 text-[10.5px] font-medium tabular-nums text-muted-foreground shadow-sm">
          <Trans>p. {claim.page}</Trans>
        </span>
      </span>
    </button>
  )
}

/**
 * Proof drawn on the page (e22): for each thing the assistant found, the page that shows it, with an
 * accent outline that draws itself around the page's content and a small label that pops on its
 * edge. The engine says which pages show a thing but not where on them, so the outline goes around
 * the whole content, and the note under the pages says so.
 */
export function PageBoxes({ file, claims }: { file: File | null | undefined; claims: BoxClaim[] }) {
  const [viewer, setViewer] = useState<number | null>(null)
  if (!file || claims.length === 0) return null
  const pages = [...new Set(claims.map((c) => c.page))]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-4 pb-1">
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
