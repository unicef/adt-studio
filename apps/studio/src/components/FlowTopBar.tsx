import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { LocaleSwitcher } from "@/components/LocaleSwitcher"
import {
  MacOSTrafficLightSpacer,
  TitleBarControls,
} from "@/components/title-bar"
import { useAppLogo } from "@/hooks/use-app-logo"
import { usePlatform } from "@/hooks/use-platform"
import { useWindowControls } from "@/hooks/use-window-controls"
import { DRAG_REGION, NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"

export type FlowTopBarProps = {
  /** Context label shown after the home affordance (e.g. “Add Book”). */
  title?: ReactNode
  /** Where the home affordance goes. Defaults to the library at `/`. */
  onBack?: () => void
}

/**
 * Chrome for full-screen flows (add-book wizard, import) that render outside the
 * app shell. The logo doubles as the home button — a back arrow slides in on
 * hover — followed by the current page title. Owns the frameless-window drag
 * region, the macOS traffic-light spacing, and the Windows/Linux controls.
 */
export function FlowTopBar({ title, onBack }: FlowTopBarProps) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const platform = usePlatform()
  const logoSrc = useAppLogo()
  const { available: hasWindowControls } = useWindowControls()
  const showNonMacControls = hasWindowControls && platform !== "macos"

  const goHome = onBack ?? (() => navigate({ to: "/" }))

  return (
    <header
      style={DRAG_REGION}
      className={cn(
        "flex h-12 shrink-0 select-none items-center gap-2 border-b border-border bg-background/80 pl-2 text-foreground backdrop-blur",
        showNonMacControls ? "pr-0" : "pr-2",
      )}
    >
      <MacOSTrafficLightSpacer />

      <div className="flex min-w-0 items-center gap-2" style={NO_DRAG_REGION}>
        <button
          type="button"
          onClick={goHome}
          title={t`Back to library`}
          aria-label={t`Back to library`}
          className="group -ml-0.5 flex items-center rounded-lg py-1 pl-1.5 pr-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          <ArrowLeft className="-ml-4 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 ease-out group-hover:ml-0 group-hover:mr-1 group-hover:opacity-100" />
          <img
            src={logoSrc}
            alt=""
            className="size-6 shrink-0 rounded-[7px] shadow-[0_1px_5px_rgba(43,127,255,0.4)]"
          />
        </button>

        {title != null && (
          <span className="truncate text-[13.5px] font-semibold">{title}</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5" style={NO_DRAG_REGION}>
        <LocaleSwitcher variant="standalone" />
      </div>

      {showNonMacControls && <TitleBarControls className="self-stretch" />}
    </header>
  )
}
