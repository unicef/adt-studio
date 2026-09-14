import { Link } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { ArrowLeft, HardDrive } from "lucide-react"
import { APP_PATHS } from "../../nav"

export function SettingsRailFooter() {
  return (
    <div className="flex flex-col gap-0.5 border-t p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px]">
        <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <HardDrive className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 leading-[1.15]">
          <div className="truncate text-[12.5px] font-semibold">
            <Trans>Local account</Trans>
          </div>
          <div className="text-[10.5px] text-muted-foreground">
            <Trans>This computer</Trans>
          </div>
        </div>
      </div>

      <Link
        to={APP_PATHS.home}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      >
        <ArrowLeft className="size-[17px]" />
        <span className="flex-1 text-left">
          <Trans>Back to home</Trans>
        </span>
      </Link>
    </div>
  )
}
