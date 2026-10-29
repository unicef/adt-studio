import { useEffect, useRef, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { CrossFade } from "./CrossFade"

const SHEET_BUTTON = cn(
  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
)

const EXIT_FALLBACK_MS = 320

export function PageDetailSheet({
  open,
  contentKey,
  title,
  pageSrc,
  pageNumber,
  onClose,
  children,
}: {
  open: boolean
  contentKey: string
  title: ReactNode
  pageSrc: string | null
  pageNumber: number
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useLingui()
  const backRef = useRef<HTMLButtonElement>(null)
  const [mounted, setMounted] = useState(open)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setMounted(true)
  }

  useEffect(() => {
    if (open || !mounted) return
    const timer = setTimeout(() => setMounted(false), EXIT_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    backRef.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, onClose])

  if (!mounted) return null
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "absolute inset-0 z-10 rounded-xl bg-background/45 backdrop-blur-[1px]",
          open
            ? "opacity-100 transition-opacity duration-[260ms] ease-out starting:opacity-0"
            : "pointer-events-none opacity-0 transition-opacity duration-[180ms] ease-in",
          "motion-reduce:transition-none",
        )}
      />
      <section
        role="dialog"
        data-state={open ? "open" : "closed"}
        aria-modal={false}
        aria-label={t`Page section`}
        inert={!open}
        onTransitionEnd={(event) => {
          if (!open && event.target === event.currentTarget && event.propertyName === "opacity") setMounted(false)
        }}
        className={cn(
          "absolute inset-0 z-20 flex flex-col overflow-hidden rounded-xl border bg-card shadow-xl",
          open
            ? "translate-x-0 opacity-100 transition-[opacity,translate] duration-[260ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] starting:translate-x-6 starting:opacity-0"
            : "translate-x-6 opacity-0 transition-[opacity,translate] duration-[180ms] ease-in",
          "motion-reduce:translate-x-0 motion-reduce:starting:translate-x-0",
        )}
      >
        <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
          <button ref={backRef} type="button" onClick={onClose} className={SHEET_BUTTON}>
            <ArrowLeft className="size-3.5" />
            <Trans>Back to page</Trans>
          </button>
          {pageSrc && (
            <img
              src={pageSrc}
              alt={t`Page ${pageNumber}`}
              className="h-10 w-auto rounded-md border bg-white shadow-sm transition-[opacity,scale] delay-75 duration-[260ms] ease-out starting:scale-90 starting:opacity-0 motion-reduce:starting:scale-100"
            />
          )}
          <CrossFade itemKey={contentKey} className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold text-foreground">{title}</h2>
          </CrossFade>
          <button type="button" onClick={onClose} aria-label={t`Close`} title={t`Close`} className={cn(SHEET_BUTTON, "ml-auto w-8 justify-center px-0")}>
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 [scrollbar-width:thin]">
          <CrossFade itemKey={contentKey}>{children}</CrossFade>
        </div>
      </section>
    </>
  )
}
