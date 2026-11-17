import { useEffect, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { getChromePortalContainer } from "@/shared/lib/chrome-portal"
import { clearChromeInset, setChromeInset } from "@/shared/lib/chrome-insets"
import { useTranslation } from "@/features/language/hooks/useTranslation"
import { DockPanelVariantContext } from "@/features/dock/context/panel-variant-context"

interface DockDrawerProps {
  open: boolean
  onClose: () => void
  side: "left" | "right"
  behavior: "overlay" | "push"
  label?: string
  children: React.ReactNode
}

/**
 * A dock panel shown as a full-height side drawer instead of a popover — the
 * layout an author picks in the Studio Reader step (`panel_style: drawer`).
 *
 *   - overlay: floats above the book; a press on the book closes it, like the
 *     popover it replaces.
 *   - push: claims its width from the book through `chrome-insets`, so the
 *     page reflows (or re-fits, for fixed layout) beside it. It stays open
 *     while the reader works in the book and closes from its button or Esc.
 *
 * Non-modal on purpose: the book stays readable and operable next to it.
 * Esc is handled by `useDockShortcuts`, which clears the open panel.
 */
export function DockDrawer({ open, onClose, side, behavior, label, children }: DockDrawerProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  // Push: hand the drawer's measured width to the book.
  useLayoutEffect(() => {
    if (!open || behavior !== "push") return
    const el = ref.current
    if (!el) return
    const update = () => setChromeInset("drawer", side, el.getBoundingClientRect().width)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      ro.disconnect()
      clearChromeInset("drawer")
    }
  }, [open, behavior, side])

  // Move focus in on open and back to the trigger on close.
  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>(
      'input, button:not([data-drawer-close]), [href], select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    ;(first ?? el)?.focus({ preventScroll: true })
    return () => {
      const target = restoreFocus.current
      if (target && document.contains(target)) target.focus({ preventScroll: true })
    }
  }, [open])

  // Overlay: a press on the book closes it. Presses on dock triggers are left
  // to the trigger's own toggle, as the popover does.
  useEffect(() => {
    if (!open || behavior !== "overlay") return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      // Only a press on the book itself dismisses: the chrome (dock, popups the
      // drawer's own content opens, toasts) lives in the two chrome roots.
      if (target.closest("#interface-container, #nav-container")) return
      onClose()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [open, behavior, onClose])

  if (!open) return null

  const drawer = (
    <aside
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      data-dock-panel=""
      data-drawer-side={side}
      data-drawer-behavior={behavior}
      className={cn(
        // The width the panels are designed for: the popover's 30rem. Narrower,
        // the settings rows (label + three-option switch) overflow sideways.
        // Drawers only appear from 640px up (phones get a sheet), where 85vw
        // is never below it.
        "adt-dock-drawer fixed top-0 bottom-0 z-[58] flex w-[30rem] max-w-[85vw] flex-col",
        "bg-popover text-popover-foreground shadow-xl ring-1 ring-border outline-none",
        side === "left" ? "rounded-r-[var(--radius)]" : "rounded-l-[var(--radius)]",
      )}
      // Beside the dock rail when the rail is on the same edge.
      style={side === "left" ? { left: "var(--adt-rail-left, 0px)" } : { right: "var(--adt-rail-right, 0px)" }}
    >
      {/* The panel content brings its own heading; the bar only closes. */}
      <div className="flex shrink-0 items-center justify-end px-2 pt-2">
        <button
          type="button"
          data-drawer-close=""
          onClick={onClose}
          aria-label={t("close") || "Close"}
          title={t("close") || "Close"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground/70 hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <DockPanelVariantContext.Provider value="drawer">{children}</DockPanelVariantContext.Provider>
      </div>
    </aside>
  )

  const container = getChromePortalContainer()
  return container ? createPortal(drawer, container) : drawer
}
