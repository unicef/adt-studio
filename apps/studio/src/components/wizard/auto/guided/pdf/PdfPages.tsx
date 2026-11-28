import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight, FileText, FileUp } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { usePageThumb } from "../../../core/pdf/usePageThumb"

/** One page in the trail, drawn only once it scrolls into view (a long book stays quick to open). */
function TrailPage({ file, page, current, root, onPick }: { file: File; page: number; current: boolean; root: HTMLElement | null; onPick: () => void }) {
  const { t } = useLingui()
  const ref = useRef<HTMLButtonElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { root, rootMargin: "300px" })
    io.observe(el)
    return () => io.disconnect()
  }, [root, seen])
  // The page in focus scrolls into the middle of the trail.
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" })
  }, [current])
  const src = usePageThumb(file, seen ? page : 0, 120)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onPick}
      aria-label={t`Page ${page}`}
      aria-current={current ? "page" : undefined}
      tabIndex={current ? 0 : -1}
      className="group flex shrink-0 flex-col items-center gap-1 rounded-[10px] p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span
        className={cn(
          "grid aspect-[3/4] w-[72px] place-items-center overflow-hidden rounded-[4px] bg-white shadow-[0_3px_10px_-6px_rgba(15,23,42,0.4)] ring-1 transition-[box-shadow,transform] duration-150 motion-reduce:transition-none lg:w-[88px]",
          current ? "ring-[3px] ring-brand-500" : "ring-border group-hover:-translate-y-0.5 group-hover:ring-brand-300",
        )}
      >
        {src ? <img src={src} alt="" draggable={false} className="max-h-full max-w-full object-contain" /> : <FileText aria-hidden className="size-4 text-muted-foreground/50" />}
      </span>
      <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", current ? "bg-brand-500 text-white" : "text-muted-foreground")}>{page}</span>
    </button>
  )
}

/** The page in focus, as large as the stage allows. */
function FocusPage({ file, page }: { file: File; page: number }) {
  const src = usePageThumb(file, page, 900)
  return src ? (
    <img key={src} src={src} alt="" draggable={false} className="max-h-full max-w-full rounded-[3px] bg-white object-contain shadow-[0_24px_60px_-24px_rgba(15,23,42,0.6)] ring-1 ring-black/5 animate-in fade-in duration-200 motion-reduce:animate-none" />
  ) : (
    <span className="aspect-[3/4] h-full max-h-full rounded-[3px] bg-white/70 motion-safe:animate-pulse" />
  )
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- Tailwind classes, never shown
const ARROW = "absolute top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-[0_6px_18px_-8px_rgba(15,23,42,0.5)] ring-1 ring-border backdrop-blur transition-[background-color,transform] hover:bg-card active:scale-[0.95] disabled:opacity-0"

/**
 * Every page of the PDF, like a PDF viewer: the page in focus large, the trail of all pages on the
 * right (under it on a phone) with the current one marked, ← → (or ↑ ↓) to move through them. It
 * comes in as a solid sheet over a blurred page, so nothing behind shows through while it opens.
 */
export function PdfPages({ file, title, pageCount, open, onClose, onChange, locked = false }: { file: File; title: string; pageCount: number; open: boolean; onClose: () => void; onChange: () => void; locked?: boolean }) {
  const { t } = useLingui()
  const [page, setPage] = useState(1)
  const [trail, setTrail] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (open) setPage(1)
  }, [open])
  const total = Math.max(1, pageCount)
  const go = (to: number) => setPage(Math.min(total, Math.max(1, to)))
  const keys = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp" ? -1 : 0
    if (step) {
      e.preventDefault()
      go(page + step)
    } else if (e.key === "Home") go(1)
    else if (e.key === "End") go(total)
  }
  const pages = Array.from({ length: total }, (_, i) => i + 1)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        overlayClassName="bg-black/45 backdrop-blur-[6px] data-[state=open]:duration-200 data-[state=closed]:duration-150"
        className="gd-sheet flex h-[min(90vh,860px)] max-w-[min(94vw,1120px)] flex-col gap-0 overflow-hidden rounded-[22px] p-0"
        onKeyDown={keys}
        // Opens on the page in focus in the trail (not on Change PDF); the arrows work from there.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[aria-current=page]")?.focus({ preventScroll: true })
        }}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3 pr-16">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[15px] font-semibold">{title}</DialogTitle>
            <DialogDescription className="text-[12.5px] tabular-nums text-muted-foreground">
              <Trans>
                Page {page} of {total}
              </Trans>
            </DialogDescription>
          </div>
          <button type="button" onClick={onChange} disabled={locked} title={locked ? t`The book is being set up, so its PDF can't change now.` : undefined} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
            <FileUp className="size-4" />
            <Trans>Change PDF</Trans>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* The stage: the page in focus, with arrows either side. */}
          <div className="relative min-h-[50vh] min-w-0 flex-1 bg-[var(--lc-stage,var(--muted))] sm:min-h-0">
            <div className="absolute inset-4 flex items-center justify-center sm:inset-x-16 sm:inset-y-6">
              <FocusPage file={file} page={page} />
            </div>
            <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} aria-label={t`Previous page`} className={cn(ARROW, "left-3")}>
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => go(page + 1)} disabled={page >= total} aria-label={t`Next page`} className={cn(ARROW, "right-3")}>
              <ChevronRight className="size-5" />
            </button>
          </div>
          {/* The trail: every page, the current one marked. */}
          <div
            ref={setTrail}
            role="group"
            aria-label={t`All pages`}
            className="flex shrink-0 gap-1 overflow-auto border-border bg-card p-2 max-sm:border-t sm:w-[124px] sm:flex-col sm:items-center sm:border-l sm:py-3 lg:w-[140px]"
          >
            {pages.map((n) => (
              <TrailPage key={n} file={file} page={n} current={n === page} root={trail} onPick={() => go(n)} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
