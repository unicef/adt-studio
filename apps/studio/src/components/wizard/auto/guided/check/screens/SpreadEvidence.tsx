import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { cn } from "@/lib/utils"
import { Illustration } from "../../shared/Illustration"

/**
 * The evidence pages as the book shows them: facing pairs (8 and 9) together, any other page on
 * its own. Wide pages already hold a pair each, so they always stand alone.
 */
export function openings(pages: number[], wide = false): number[][] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  if (wide) return sorted.map((p) => [p])
  const out: number[][] = []
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!
    if (sorted[i + 1] === p + 1) {
      out.push([p, p + 1])
      i++
    } else out.push([p])
  }
  return out
}

function Page({ file, page, side }: { file: File; page: number; side: "left" | "right" | "alone" }) {
  const src = usePageThumb(file, page, 260)
  const round = side === "left" ? "rounded-l-[4px]" : side === "right" ? "rounded-r-[4px]" : "rounded-[4px]"
  return src ? (
    <img src={src} alt="" draggable={false} className={cn("block h-auto max-h-[min(24vh,190px)] w-auto min-w-0 max-w-full bg-white object-contain", round)} />
  ) : (
    <span className={cn("block h-[min(24vh,190px)] w-[min(17vh,135px)] animate-pulse bg-muted motion-reduce:animate-none", round)} />
  )
}

/** One opening: its pages side by side with no gap, a soft fold between them, as the book lies open. */
function Opening({ file, pages, wide }: { file: File; pages: number[]; wide: boolean }) {
  const [a, b] = pages
  return (
    <figure className="flex min-w-0 flex-col items-center gap-2">
      <span className="relative flex max-w-full rounded-[5px] shadow-[0_14px_30px_-16px_rgba(15,23,42,0.55)] ring-1 ring-border">
        <Page file={file} page={a!} side={b ? "left" : "alone"} />
        {b && <Page file={file} page={b} side="right" />}
        {/* The fold: a soft shade down the middle of the joined screen. */}
        {b && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-8 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(15,23,42,0.12)_50%,transparent)]" />}
      </span>
      <figcaption className="text-[13px] text-muted-foreground">
        {b ? (
          <Trans>
            Pages {a} and {b}, joined into one screen
          </Trans>
        ) : wide ? (
          <Trans>Page {a}: two pages already side by side</Trans>
        ) : (
          <Trans>Page {a}</Trans>
        )}
      </figcaption>
    </figure>
  )
}

/**
 * "Where I saw it" on Facing pages: a marker naming the openings ("Pages 8–9, 12–13") that opens a
 * dialog: the case on a made-up book (an illustration) with what it means in plain words, then the
 * user's own pages, each pair joined as the book lies open (or each wide page as it is).
 */
export function SpreadEvidence({ file, pages, rule, wide }: { file: File | null | undefined; pages: number[]; rule: string | undefined; wide: boolean }) {
  const { i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const groups = openings(pages, wide)
  if (!file || groups.length === 0) return null
  // The made-up book that shows the case (public/add-book/grouping-*.png).
  const art = wide ? "grouping-wide" : rule === "group-facing-pages" ? "grouping-facing" : "grouping-spread"
  const names = new Intl.ListFormat(i18n.locale, { type: "conjunction" }).format(groups.map((g) => (g.length === 2 ? `${g[0]}–${g[1]}` : String(g[0]))))
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-[13px] font-semibold text-brand-700 ring-1 ring-brand-200 transition-[background-color,box-shadow] hover:bg-brand-100 hover:ring-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
      >
        <BookOpen aria-hidden className="size-3.5" />
        {groups.length === 1 && groups[0]!.length === 1 ? <Trans>Page {names}</Trans> : <Trans>Pages {names}</Trans>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-[min(94vw,820px)] flex-col gap-5 overflow-y-auto rounded-[24px] p-5 sm:p-6">
          {/* The case on a made-up book first, so it's clear what to look for; then the user's own pages. */}
          <div className="grid items-center gap-5 pr-8 sm:grid-cols-[240px_minmax(0,1fr)]">
            <span aria-hidden className="grid h-[150px] place-items-center">
              <Illustration name={art} />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <DialogTitle className="text-[18px] font-bold tracking-[-0.01em]">{wide ? <Trans>Pages that already hold two pages</Trans> : <Trans>Where pages go together</Trans>}</DialogTitle>
              <DialogDescription className="text-[14px] leading-relaxed text-muted-foreground">
                {rule === "group-facing-pages" ? (
                  <Trans>On these pages a page of words faces a page of picture, as one opening. Joined, each pair stays together on one screen, the way the book lies open.</Trans>
                ) : wide ? (
                  <Trans>These PDF pages already show two facing pages side by side, so each one stays one screen as it is. Nothing is joined.</Trans>
                ) : (
                  <Trans>On these pages a picture carries on over the fold onto the facing page. Joined, each pair becomes one wide screen and the picture stays whole; on its own, each half would be a separate screen.</Trans>
                )}
              </DialogDescription>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground/65">
              <Trans>In your book</Trans>
            </p>
            <div className="grid gap-6 rounded-[16px] bg-[var(--lc-stage,var(--muted))] px-4 py-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
              {groups.map((g) => (
                <Opening key={g[0]} file={file} pages={g} wide={wide} />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
