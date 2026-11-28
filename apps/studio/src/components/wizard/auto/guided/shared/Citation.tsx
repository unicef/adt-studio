import { useRef, useState, type KeyboardEvent } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight, FileText } from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { cn } from "@/lib/utils"
import { evidenceList, PageViewer } from "./Evidence"
import "./citation.css"

const ARROW = "grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"

/** One page on the track: drawn once, kept while the card is open. */
function Slide({ file, page, onOpen, current }: { file: File; page: number; onOpen: () => void; current: boolean }) {
  const { t } = useLingui()
  const src = usePageThumb(file, page, 220)
  return (
    <button
      type="button"
      onClick={onOpen}
      tabIndex={current ? 0 : -1}
      aria-hidden={!current || undefined}
      aria-label={t`Show page ${page} larger`}
      className="group grid h-[214px] w-full shrink-0 place-items-center rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="max-h-[200px] max-w-[160px] rounded-[3px] shadow-[0_6px_16px_-8px_rgba(15,23,42,0.5)] ring-1 ring-border transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none" />
      ) : (
        <span className="h-[190px] w-[140px] animate-pulse rounded-[3px] bg-muted motion-reduce:animate-none" />
      )}
    </button>
  )
}

/** The evidence pages side by side in a strip that slides to the current one. */
function Track({ file, pages, at, onOpen }: { file: File; pages: number[]; at: number; onOpen: (page: number) => void }) {
  return (
    <div className="overflow-hidden rounded-[10px] bg-[var(--lc-stage,var(--muted))]">
      <div className="cite-track flex" style={{ transform: `translateX(${-at * 100}%)` }}>
        {pages.map((p, i) => (
          <Slide key={p} file={file} page={p} current={i === at} onOpen={() => onOpen(p)} />
        ))}
      </div>
    </div>
  )
}

/**
 * An inline citation in the assistant's sentence: "4 pages" (or "Page 24"), after shadcn AI
 * Elements' InlineCitation. Hover, focus or click opens a card with the pages it read this on; ← →
 * slide through them (on the marker or in the card); a page opens the large viewer.
 */
export function Citation({ file, pages, className }: { file: File | null | undefined; pages: number[]; className?: string }) {
  const { t, i18n } = useLingui()
  const list = evidenceList(pages)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const [viewer, setViewer] = useState<number | null>(null)
  const content = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  if (!file || list.length === 0) return null
  const page = list[at] ?? list[0]!
  const firstPage = list[0]!
  const flip = (d: number) => setAt((a) => (a + d + list.length) % list.length)
  const inside = (el: Element | null) => !!el && (content.current?.contains(el) || trigger.current === el)
  const keys = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault()
      setOpen(true)
      if (list.length > 1) flip(e.key === "ArrowRight" ? 1 : -1)
    } else if (e.key === "Escape" && open) {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
  }
  const all = new Intl.ListFormat(i18n.locale, { type: "conjunction" }).format(list.map(String))
  return (
    <>
      <HoverCard
        open={open}
        openDelay={120}
        closeDelay={180}
        onOpenChange={(o) => {
          // Focus moved into the card (Tab from the marker): it stays open.
          if (!o && inside(document.activeElement)) return
          setOpen(o)
        }}
      >
        <HoverCardTrigger asChild>
          <button
            ref={trigger}
            type="button"
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey && open) {
                const first = content.current?.querySelector<HTMLElement>("button")
                if (first) {
                  e.preventDefault()
                  first.focus()
                  return
                }
              }
              keys(e)
            }}
            aria-label={list.length === 1 ? t`Read on page ${firstPage}` : t`Read on pages ${all}`}
            aria-expanded={open}
            className={cn("cite-chip ml-1.5 mr-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full bg-brand-50 px-2 py-px align-middle text-[0.72em] font-semibold leading-[1.5] text-brand-700 ring-1 ring-brand-200 transition-[background-color,box-shadow] hover:bg-brand-100 hover:ring-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 data-[state=open]:bg-brand-100 data-[state=open]:ring-brand-400", className)}
          >
            <FileText aria-hidden className="size-[1.05em]" />
            {list.length === 1 ? <Trans>Page {firstPage}</Trans> : <Plural value={list.length} one="# page" other="# pages" />}
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          ref={content}
          side="top"
          sideOffset={8}
          className="cite-card w-[196px] rounded-[16px] border-0 bg-[var(--lc-bubble,var(--popover))] p-2 shadow-[0_0_0_1px_var(--lc-line,var(--border)),0_18px_40px_-18px_rgba(15,23,42,0.55)]"
          onKeyDown={keys}
          onBlur={(e) => {
            if (!inside(e.relatedTarget as Element | null)) setOpen(false)
          }}
          onEscapeKeyDown={() => setOpen(false)}
        >
          <p className="px-1 pb-1.5 text-[12px] font-medium text-muted-foreground">
            {list.length === 1 ? <Trans>The page I read this on</Trans> : <Trans>The pages I read this on</Trans>}
          </p>
          <Track
            file={file}
            pages={list}
            at={at}
            onOpen={(p) => {
              setViewer(p)
              setOpen(false)
            }}
          />
          <div className="mt-1.5 flex items-center justify-between gap-1">
            {list.length > 1 ? (
              <button type="button" onClick={() => flip(-1)} aria-label={t`Previous page`} className={ARROW}>
                <ChevronLeft className="size-4" />
              </button>
            ) : (
              <span className="size-7" />
            )}
            <span className="flex flex-col items-center gap-1 text-[12px] font-semibold tabular-nums text-muted-foreground" aria-live="polite">
              <Trans>Page {page}</Trans>
              {list.length > 1 && (
                <span aria-hidden className="flex gap-1">
                  {list.map((p, i) => (
                    <span key={p} className={cn("size-1.5 rounded-full transition-colors duration-200", i === at ? "bg-brand-500" : "bg-border")} />
                  ))}
                </span>
              )}
            </span>
            {list.length > 1 ? (
              <button type="button" onClick={() => flip(1)} aria-label={t`Next page`} className={ARROW}>
                <ChevronRight className="size-4" />
              </button>
            ) : (
              <span className="size-7" />
            )}
          </div>
        </HoverCardContent>
      </HoverCard>
      <PageViewer file={file} pages={list} page={viewer} onPage={setViewer} />
    </>
  )
}
