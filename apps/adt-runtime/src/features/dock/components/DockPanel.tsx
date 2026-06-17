import { Popover, PopoverContent } from "@/shared/ui/popover"

interface DockPanelProps {
  open: boolean
  onClose: () => void
  anchor?: React.RefObject<HTMLElement | null>
  side?: "top" | "bottom"
  /**
   * When true, the popover ignores outside-click and escape dismissal. The
   * only ways to close it are programmatic (e.g. clicking Stop in the
   * panel) or re-clicking the dock trigger button.
   */
  staysOpen?: boolean
  children: React.ReactNode
}

function DockPanel({
  open,
  onClose,
  anchor,
  side = "top",
  staysOpen,
  children,
}: DockPanelProps) {
  return (
    <Popover
      open={open}
      onOpenChange={(next, eventDetails) => {
        if (next) return
        if (
          eventDetails.reason === "outside-press" &&
          eventDetails.event &&
          (eventDetails.event.target as HTMLElement | null)?.closest(
            "[data-dock-trigger]",
          )
        ) {
          return
        }
        if (
          staysOpen &&
          (eventDetails.reason === "outside-press" ||
            eventDetails.reason === "escape-key")
        ) {
          return
        }
        onClose()
      }}
    >
      <PopoverContent
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
