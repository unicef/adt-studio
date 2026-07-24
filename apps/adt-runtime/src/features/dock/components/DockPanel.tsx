import { Popover, PopoverContent } from "@/shared/ui/popover"

interface DockPanelProps {
  open: boolean
  onClose: () => void
  anchor?: React.RefObject<HTMLElement | null>
  side?: "top" | "bottom"
  children: React.ReactNode
}

function DockPanel({
  open,
  onClose,
  anchor,
  side = "top",
  children,
}: DockPanelProps) {
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
