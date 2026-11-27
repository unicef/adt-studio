import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { cn } from "@/lib/utils"

/** The evidence pages as the book shows them: facing pairs (8 and 9) together, any other page on its own. */
export function openings(pages: number[]): number[][] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
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
    <img src={src} alt="" draggable={false} className={cn("block h-[min(26vh,200px)] w-auto bg-white", round)} />
  ) : (
    <span className={cn("block h-[min(26vh,200px)] w-[min(19vh,145px)] animate-pulse bg-muted motion-reduce:animate-none", round)} />
  )
}

/** One opening: its pages side by side with no gap, a soft fold between them, as the book lies open. */
function Opening({ file, pages, wide }: { file: File; pages: number[]; wide: boolean }) {
  const [a, b] = pages
  return (
    <figure className="flex flex-col items-center gap-2">
      <span className="relative flex rounded-[5px] shadow-[0_14px_30px_-16px_rgba(15,23,42,0.55)] ring-1 ring-border">
        <Page file={file} page={a!} side={b ? "left" : "alone"} />
        {b && <Page file={file} page={b} side="right" />}
        {/* The fold: a soft shade down the middle of the joined screen. */}
        {(b || wide) && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-8 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(15,23,42,0.12)_50%,transparent)]" />}
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
 * dialog showing each one joined, as the book lies open, with what was found there in plain words.
 */
export function SpreadEvidence({ file, pages, rule }: { file: File | null | undefined; pages: number[]; rule: string | undefined }) {
  const { i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const groups = openings(pages)
  if (!file || groups.length === 0) return null
  const wide = rule === "group-wide-pages"
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
        <DialogContent className="flex max-h-[90vh] max-w-[min(94vw,760px)] flex-col gap-4 rounded-[24px] p-5 sm:p-6">
          <div className="flex flex-col gap-1.5 pr-8">
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
          <div className={cn("-mx-1 grid min-h-0 flex-1 gap-6 overflow-y-auto rounded-[16px] bg-[var(--lc-stage,var(--muted))] px-4 py-5", groups.length > 1 && "sm:grid-cols-2")}>
            {groups.map((g) => (
              <Opening key={g[0]} file={file} pages={g} wide={wide} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
