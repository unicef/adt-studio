import { Popover, PopoverContent } from "@/shared/ui/popover"
import { Sheet, SheetContent } from "@/shared/ui/sheet"
import { useIsMobile } from "@/shared/hooks/use-is-mobile"
import { getChromePortalContainer } from "@/shared/lib/chrome-portal"

interface DockPanelProps {
  open: boolean
  onClose: () => void
  anchor?: React.RefObject<HTMLElement | null>
  side?: "top" | "bottom"
  children: React.ReactNode
  /** Mobile presentation:
   *  - `sheet` (default): modal bottom sheet with backdrop — for look-up tasks
   *    (TOC, glossary, language, settings) where covering the book is fine.
   *  - `inline`: a non-modal floating bar above the dock, NO backdrop, so the
   *    book stays visible and interactive — for read-aloud, where the user
   *    follows along in the text while it plays. */
  mobileVariant?: "sheet" | "inline"
}

function DockPanel({
  open,
  onClose,
  anchor,
  side = "top",
  children,
  mobileVariant = "sheet",
}: DockPanelProps) {
  const isMobile = useIsMobile()

  // Non-modal floating control (read-aloud): pinned just above the dock, no
  // backdrop, so the reader can still see and scroll the book while listening.
  if (isMobile && mobileVariant === "inline") {
    if (!open) return null
    return (
      <div
        role="group"
        className="fixed left-1/2 z-[54] flex -translate-x-1/2 items-center justify-center rounded-full border bg-popover/95 text-popover-foreground shadow-lg ring-1 ring-border backdrop-blur-md supports-[backdrop-filter]:bg-popover/85"
        style={{
          bottom:
            "calc(env(safe-area-inset-bottom) + var(--dock-height, 80px) + 0.5rem)",
        }}
      >
        {children}
      </div>
    )
  }

  // On phones the anchored popover is wider than the viewport and gets clipped
  // off-screen. Present the same content as a full-width bottom sheet instead —
  // it sits above the dock bar (z-[60] > dock z-[55]) and dismisses on backdrop
  // tap / Escape / re-tapping the trigger. The sheet owns the height cap so the
  // panel's inner ScrollArea scrolls.
  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <SheetContent
          data-dock-panel=""
          side="bottom"
          showCloseButton={false}
          container={getChromePortalContainer() ?? undefined}
          overlayClassName="z-[60]"
          className="z-[60] flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <div
            aria-hidden
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25"
          />
          {children}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next, eventDetails) => {
        if (next) return
        // Clicks on a dock trigger button (prev/next page, panel toggles)
        // are handled by the button's own onClick — don't also treat them as
        // an outside-press dismissal, or the panel would flicker/toggle. Any
        // other outside-press (a click in the book) closes the panel.
        if (
          eventDetails.reason === "outside-press" &&
          eventDetails.event &&
          (eventDetails.event.target as HTMLElement | null)?.closest(
            "[data-dock-trigger]",
          )
        ) {
          return
        }
        onClose()
      }}
    >
      <PopoverContent
        data-dock-panel=""
        side={side}
        align="center"
        sideOffset={12}
        anchor={anchor}
        // Position relative to the viewport, not the portal container
        // (`#interface-container` is a flow-positioned div at the end of
        // <body>). The dock is `position: fixed`, so viewport-relative
        // positioning keeps the panel pinned to the trigger when the page
        // content reflows — e.g. when the Easy Read toggle swaps in
        // simplified text and re-runs fixed-layout auto-fit.
        positionMethod="fixed"
        className="w-auto p-0 overflow-hidden rounded-lg"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

export { DockPanel }
