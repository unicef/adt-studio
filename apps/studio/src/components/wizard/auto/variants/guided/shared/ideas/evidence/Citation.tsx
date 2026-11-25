import { useRef, useState, type KeyboardEvent } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight, FileText } from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { cn } from "@/lib/utils"
import { evidenceList, PageViewer } from "../../Evidence"
import "./evidence.css"

const ARROW = "grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"

function Flip({ file, page, dir, onOpen }: { file: File; page: number; dir: number; onOpen: () => void }) {
  const { t } = useLingui()
  const src = usePageThumb(file, page, 220)
  return (
    <button type="button" onClick={onOpen} aria-label={t`Show page ${page} larger`} className="group grid h-[214px] w-full place-items-center overflow-hidden rounded-[10px] bg-[var(--lc-stage,var(--muted))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
      <span key={page} className={cn("ev-flip grid place-items-center", dir < 0 && "ev-flip-back")}>
        {src ? <img src={src} alt="" className="max-h-[200px] max-w-[160px] rounded-[3px] shadow-[0_6px_16px_-8px_rgba(15,23,42,0.5)] ring-1 ring-border transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none" /> : <FileText className="size-6 text-muted-foreground/50" />}
      </span>
    </button>
  )
}

/**
 * An inline citation in the assistant's sentence ("p. 4 +2"), after shadcn AI Elements'
 * InlineCitation. Hover, focus or click opens a card with the page; ← → flip through the evidence
 * pages (on the marker or in the card); the page opens the large viewer.
 */
export function Citation({ file, pages, className }: { file: File | null | undefined; pages: number[]; className?: string }) {
  const { t, i18n } = useLingui()
  const list = evidenceList(pages)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const [dir, setDir] = useState(1)
  const [viewer, setViewer] = useState<number | null>(null)
  const content = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  if (!file || list.length === 0) return null
  const page = list[at] ?? list[0]!
  const firstPage = list[0]!
  const more = list.length - 1
  const flip = (d: number) => {
    setDir(d)
    setAt((a) => (a + d + list.length) % list.length)
  }
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
            aria-label={list.length === 1 ? t`Evidence: page ${firstPage}` : t`Evidence: pages ${all}`}
            aria-expanded={open}
            className={cn("ev-cite ml-1.5 mr-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-[7px] bg-brand-50 px-1.5 py-px align-middle font-mono text-[0.68em] font-semibold leading-[1.5] text-brand-700 ring-1 ring-brand-200 transition-[background-color,box-shadow] hover:bg-brand-100 hover:ring-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 data-[state=open]:bg-brand-100 data-[state=open]:ring-brand-400", className)}
          >
            <span>
              <Trans>p. {firstPage}</Trans>
            </span>
            {more > 0 && <span className="text-brand-700/70">+{more}</span>}
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          ref={content}
          side="top"
          sideOffset={8}
          className="ev-card w-[196px] rounded-[16px] border-0 bg-[var(--lc-bubble,var(--popover))] p-2 shadow-[0_0_0_1px_var(--lc-line,var(--border)),0_18px_40px_-18px_rgba(15,23,42,0.55)]"
          onKeyDown={keys}
          onBlur={(e) => {
            if (!inside(e.relatedTarget as Element | null)) setOpen(false)
          }}
          onEscapeKeyDown={() => setOpen(false)}
        >
          <Flip file={file} page={page} dir={dir} onOpen={() => {
            setViewer(page)
            setOpen(false)
          }} />
          <div className="mt-1.5 flex items-center justify-between gap-1">
            {list.length > 1 ? (
              <button type="button" onClick={() => flip(-1)} aria-label={t`Previous page`} className={ARROW}>
                <ChevronLeft className="size-4" />
              </button>
            ) : (
              <span className="size-7" />
            )}
            <span className="text-[12px] font-semibold tabular-nums text-muted-foreground" aria-live="polite">
              {list.length > 1 ? (
                <Trans>
                  p. {page} · {at + 1} of {list.length}
                </Trans>
              ) : (
                <Trans>p. {page}</Trans>
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
