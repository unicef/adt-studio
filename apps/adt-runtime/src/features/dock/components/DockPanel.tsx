import { createPortal } from "react-dom"
import { Popover, PopoverContent } from "@/shared/ui/popover"
import { Sheet, SheetContent } from "@/shared/ui/sheet"
import { useIsMobile } from "@/shared/hooks/use-is-mobile"
import { useDockContext } from "@/features/dock/context/dock-context"
import { getChromePortalContainer } from "@/shared/lib/chrome-portal"

interface DockPanelProps {
  open: boolean
  onClose: () => void
  anchor?: React.RefObject<HTMLElement | null>
  side?: "top" | "bottom"
  children: React.ReactNode
  mobileVariant?: "sheet" | "inline"
  persistent?: boolean
}

function InlineBar({ children }: { children: React.ReactNode }) {
  const { isTop } = useDockContext()
  const offset = "calc(env(safe-area-inset-bottom) + var(--dock-height, 80px) + 0.75rem)"
  const topOffset = "calc(env(safe-area-inset-top) + var(--dock-height, 80px) + 0.75rem)"

  return (
    <div
      className="fixed left-1/2 z-[54] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center justify-center rounded-full border bg-popover/95 text-popover-foreground shadow-lg ring-1 ring-border backdrop-blur-md supports-[backdrop-filter]:bg-popover/85"
      style={isTop ? { top: topOffset } : { bottom: offset }}
    >
      {children}
    </div>
  )
}

function DockPanel({
  open,
  onClose,
  anchor,
  side = "top",
  children,
  mobileVariant = "sheet",
  persistent = false,
}: DockPanelProps) {
  const isMobile = useIsMobile()

  if (isMobile && mobileVariant === "inline") {
    if (!open) return null
    const container = getChromePortalContainer()
    return container
      ? createPortal(<InlineBar>{children}</InlineBar>, container)
      : <InlineBar>{children}</InlineBar>
  }

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
        if (persistent) return
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
