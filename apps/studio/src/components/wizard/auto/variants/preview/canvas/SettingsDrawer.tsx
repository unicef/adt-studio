import { useEffect, useRef, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The settings, closed by default. Not modal, so the preview stays in view and morphs as a setting
 * changes: a panel that slides in beside the canvas on a computer, a sheet over the lower part of
 * the screen on a phone (the preview still shows above it). Escape closes it and focus goes back.
 */
export function SettingsDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { t } = useLingui()
  const heading = useRef<HTMLHeadingElement>(null)
  const back = useRef<Element | null>(null)
  useEffect(() => {
    if (open) {
      back.current = document.activeElement
      heading.current?.focus()
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
      window.addEventListener("keydown", onKey)
      return () => window.removeEventListener("keydown", onKey)
    }
    if (back.current instanceof HTMLElement) back.current.focus()
  }, [open])
  return (
    <>
      <button type="button" aria-hidden tabIndex={-1} onClick={onClose} className={cn("fixed inset-0 z-30 bg-slate-950/25 transition-opacity duration-300 motion-reduce:transition-none lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} />
      <aside
        aria-labelledby="pf-settings-title"
        inert={!open}
        className={cn(
          "z-40 flex flex-col overflow-hidden bg-background transition-[transform,width,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          "fixed inset-x-0 bottom-0 max-h-[58vh] rounded-t-[28px] border-t shadow-[0_-20px_50px_-20px_rgba(15,23,42,0.45)]",
          "lg:static lg:max-h-none lg:shrink-0 lg:rounded-[24px] lg:border lg:bg-card/80 lg:shadow-none lg:backdrop-blur",
          open ? "translate-y-0 lg:w-[360px] lg:opacity-100" : "pointer-events-none translate-y-full lg:w-0 lg:translate-y-0 lg:border-0 lg:opacity-0",
        )}
      >
        <div className="flex w-full flex-col overflow-y-auto lg:w-[360px]">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-inherit px-5 pb-2 pt-4 backdrop-blur">
            <h2 id="pf-settings-title" ref={heading} tabIndex={-1} className="text-[17px] font-semibold tracking-[-0.01em] outline-none">
              <Trans>Settings</Trans>
            </h2>
            <button type="button" onClick={onClose} aria-label={t`Close settings`} className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
              <X className="size-4" />
            </button>
          </div>
          <div className="px-4 pb-5">{children}</div>
        </div>
      </aside>
    </>
  )
}
