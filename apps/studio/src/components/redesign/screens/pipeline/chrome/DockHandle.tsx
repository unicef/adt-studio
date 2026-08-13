import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export interface DockHandleProps {
  onShow: () => void
  /** Slides in as the dock slides out. Stays mounted so both directions animate. */
  visible?: boolean
}

/**
 * The dock, minimized. Collapsing the dock leaves this grabber flush with the
 * bottom edge so the dock stays findable — clicking it brings the dock back.
 */
export function DockHandle({ onShow, visible = true }: DockHandleProps) {
  const { t } = useLingui()

  return (
    <button
      type="button"
      onClick={onShow}
      inert={!visible}
      aria-hidden={!visible}
      title={t`Show the dock`}
      aria-label={t`Show the dock`}
      className={cn(
        // Tailwind v4 drives the offset through `translate`, so that is what the
        // transition has to watch — `transform` would not animate.
        "group fixed bottom-0 left-1/2 z-30 flex -translate-x-1/2 justify-center rounded-t-2xl border border-b-0 bg-card/92 px-10 pb-2.5 pt-2 shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.45)] backdrop-blur-md transition-[translate,opacity,background-color] duration-300 ease-out hover:bg-card motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
      )}
    >
      <span className="h-1 w-9 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-muted-foreground/60" />
    </button>
  )
}
