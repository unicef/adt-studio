import { useLingui } from "@lingui/react/macro"

export interface DockHandleProps {
  onShow: () => void
}

/**
 * The dock, minimized. Hiding the chrome leaves this grabber flush with the
 * bottom edge so the dock stays findable — clicking it brings the dock back.
 */
export function DockHandle({ onShow }: DockHandleProps) {
  const { t } = useLingui()

  return (
    <button
      type="button"
      onClick={onShow}
      title={t`Show the controls`}
      aria-label={t`Show the controls`}
      className="group fixed bottom-0 left-1/2 z-30 flex -translate-x-1/2 animate-in slide-in-from-bottom-2 justify-center rounded-t-2xl border border-b-0 bg-card/92 px-10 pb-2.5 pt-2 shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.45)] backdrop-blur-md transition-colors hover:bg-card"
    >
      <span className="h-1 w-9 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-muted-foreground/60" />
    </button>
  )
}
