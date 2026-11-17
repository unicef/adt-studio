/**
 * Themed wrapper around Base UI's `ScrollArea` primitive.
 *
 *   https://base-ui.com/react/components/scroll-area
 *
 * Use this for every overflowing region in adt-runtime — popover panels,
 * TOC / page lists, settings panes — so the scrollbar is consistent across
 * the runtime (overlay style, fades on idle, dark-mode aware).
 *
 * The `Root` is given `relative overflow-hidden` and consumes whatever
 * height the caller passes via `className`. The `Viewport` fills the Root
 * and is the actual scrolling element. Vertical and horizontal scrollbars
 * are both rendered; Base UI's data attributes hide them automatically
 * when the content fits.
 */
import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "@/shared/lib/utils"

interface ScrollAreaProps extends ComponentProps<typeof BaseScrollArea.Root> {
  children: ReactNode
  /** Classes applied to the viewport (the scrolling element). */
  viewportClassName?: string
  /** Keep scrollbars mounted even when content fits — useful for stable layout. */
  keepBarsMounted?: boolean
}

export function ScrollArea({
  className,
  viewportClassName,
  keepBarsMounted,
  children,
  ...props
}: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <BaseScrollArea.Viewport
        className={cn(
          "h-full w-full overscroll-contain outline-none",
          viewportClassName,
        )}
      >
        <BaseScrollArea.Content>{children}</BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      <ScrollAreaBar orientation="vertical" keepMounted={keepBarsMounted} />
      <ScrollAreaBar orientation="horizontal" keepMounted={keepBarsMounted} />
      <BaseScrollArea.Corner className="bg-transparent" />
    </BaseScrollArea.Root>
  )
}

function ScrollAreaBar({
  orientation,
  keepMounted,
}: {
  orientation: "vertical" | "horizontal"
  keepMounted?: boolean
}) {
  return (
    <BaseScrollArea.Scrollbar
      orientation={orientation}
      keepMounted={keepMounted}
      className={cn(
        "flex touch-none select-none p-0.5 z-10",
        "opacity-0 data-[hovering]:opacity-100 data-[scrolling]:opacity-100",
        "transition-opacity duration-200 ease-out motion-reduce:transition-none",
        orientation === "vertical"
          ? "h-full w-2 justify-center"
          : "w-full h-2 items-center",
      )}
    >
      <BaseScrollArea.Thumb
        className={cn(
          "rounded-full bg-foreground/25 hover:bg-foreground/45 active:bg-foreground/60",
          "transition-colors duration-150 motion-reduce:transition-none",
          orientation === "vertical" ? "w-full" : "h-full",
        )}
      />
    </BaseScrollArea.Scrollbar>
  )
}
