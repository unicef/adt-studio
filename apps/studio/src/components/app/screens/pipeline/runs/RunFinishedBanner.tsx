import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight, Check, X } from "lucide-react"
import { NO_DRAG_REGION } from "@/constants"

export interface RunFinishedBannerProps {
  name: string
  onReturn: () => void
  onDismiss: () => void
}

export function RunFinishedBanner({ name, onReturn, onDismiss }: RunFinishedBannerProps) {
  const { t } = useLingui()
  return (
    <div
      role="status"
      style={NO_DRAG_REGION}
      className="flex items-center gap-1 rounded-full bg-popover py-0.5 pl-1 pr-0.5 text-[11.5px] font-medium text-popover-foreground shadow-[0_6px_18px_-8px_rgba(0,0,0,0.45)] animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-300"
    >
      <span className="grid size-5 place-items-center rounded-full bg-emerald-500 text-white">
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className="px-1.5">
        <Trans>{name} finished</Trans>
      </span>
      <button
        type="button"
        onClick={onReturn}
        className="flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background transition-transform duration-150 hover:scale-[1.03] active:scale-95"
      >
        <Trans>View on storyboard</Trans>
        <ArrowRight className="size-3" />
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t`Dismiss`}
        className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
