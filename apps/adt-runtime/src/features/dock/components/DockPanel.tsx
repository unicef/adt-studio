import { useState } from "react"
import { createPortal } from "react-dom"
import type { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { Popover, PopoverContent } from "@/shared/ui/popover"
import { Drawer, DrawerContent } from "@/shared/ui/drawer"
import { useIsMobile } from "@/shared/hooks/use-is-mobile"
import { useDockContext } from "@/features/dock/context/dock-context"
import { getChromePortalContainer } from "@/shared/lib/chrome-portal"
import { cn } from "@/shared/lib/utils"

const SNAP_DEFAULT = 0.75
const SNAP_EXPANDED = 0.9
const SNAP_POINTS = [SNAP_DEFAULT, SNAP_EXPANDED]

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

function MobileDrawer({
  open,
  onClose,
  children,
}: Pick<DockPanelProps, "open" | "onClose" | "children">) {
  const [snapPoint, setSnapPoint] = useState<DrawerPrimitive.Root.SnapPoint | null>(SNAP_DEFAULT)
  const [wasOpen, setWasOpen] = useState(open)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSnapPoint(SNAP_DEFAULT)
  }

  return (
    <Drawer
      open={open}
      showSwipeHandle
      snapPoints={SNAP_POINTS}
      snapToSequentialPoints
      snapPoint={snapPoint}
      onSnapPointChange={setSnapPoint}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DrawerContent
        data-dock-panel=""
        container={getChromePortalContainer() ?? undefined}
        overlayClassName="z-[60] bg-transparent supports-backdrop-filter:backdrop-blur-none"
        viewportClassName="z-[60]"
        className="h-[90dvh] max-h-[90dvh] rounded-t-2xl shadow-lg"
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col transition-[padding] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)]",
            snapPoint === SNAP_EXPANDED
              ? "pb-[env(safe-area-inset-bottom)]"
              : "pb-[calc(15dvh+env(safe-area-inset-bottom))]",
          )}
        >
          {children}
        </div>
      </DrawerContent>
    </Drawer>
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
      <MobileDrawer open={open} onClose={onClose}>
        {children}
      </MobileDrawer>
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
        //
        // The same click also moves focus to that button in browsers that
        // focus buttons on press (Chrome, Edge), which arrives as a separate
        // focus-out dismissal. Ignore it too, so turning the page keeps the
        // open panel open, as it already does in Safari.
        const destination =
          eventDetails.reason === "outside-press"
            ? eventDetails.event?.target
            : eventDetails.reason === "focus-out"
              ? (eventDetails.event as FocusEvent | undefined)?.relatedTarget
              : null
        if (
          destination instanceof Element &&
          destination.closest("[data-dock-trigger]")
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
